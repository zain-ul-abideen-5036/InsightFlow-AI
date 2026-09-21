"""Concrete AI providers: Ollama and any OpenAI-compatible endpoint.

Both are thin. Every piece of logic that is not protocol-specific — retries,
JSON extraction, validation, repair — lives in :mod:`app.ai.base`, so adding a
third provider means implementing two methods.
"""

from __future__ import annotations

import time
from functools import lru_cache

import httpx

from app.ai.base import AIProvider, NullProvider
from app.ai.schemas import ProviderHealth
from app.core.config import settings
from app.core.errors import AIProviderError
from app.core.logging import get_logger

logger = get_logger(__name__)


class OllamaProvider(AIProvider):
    """Local models through Ollama. The development default.

    Nothing leaves the machine, which is why this is the default configuration
    for a product whose input is a business's private sales data.
    """

    name = "ollama"

    def __init__(self, base_url: str | None = None, model: str | None = None) -> None:
        self._base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self._model = model or settings.ollama_model

    @property
    def model(self) -> str:
        return self._model

    def health(self) -> ProviderHealth:
        started = time.perf_counter()
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.get(f"{self._base_url}/api/tags")
                response.raise_for_status()
                payload = response.json()
        except httpx.ConnectError:
            return ProviderHealth(
                available=False,
                provider=self.name,
                model=self._model,
                detail=(
                    f"Could not reach Ollama at {self._base_url}. "
                    "Start it with `ollama serve`."
                ),
            )
        except httpx.HTTPError as exc:
            return ProviderHealth(
                available=False, provider=self.name, model=self._model,
                detail=f"Ollama responded with an error: {exc}",
            )

        installed = {m.get("name", "") for m in payload.get("models", [])}
        # Ollama reports "llama3.2:3b"; users often configure "llama3.2".
        if self._model not in installed and not any(
            name.split(":")[0] == self._model.split(":")[0] for name in installed
        ):
            return ProviderHealth(
                available=False,
                provider=self.name,
                model=self._model,
                detail=(
                    f"Ollama is running but the model '{self._model}' is not installed. "
                    f"Install it with: ollama pull {self._model}"
                ),
            )

        return ProviderHealth(
            available=True,
            provider=self.name,
            model=self._model,
            detail=f"Connected to Ollama at {self._base_url}.",
            latency_ms=int((time.perf_counter() - started) * 1000),
        )

    def _generate(self, system: str, user: str, *, json_mode: bool, max_tokens: int) -> str:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            # Without this Ollama unloads the model after ~5 minutes, and the
            # next request pays the full load cost again -- which dominated
            # end-to-end latency in testing.
            "keep_alive": "15m",
            "options": {
                # Near-zero temperature: this model is rephrasing computed facts,
                # not composing. Creativity here is indistinguishable from error.
                "temperature": 0.1,
                "top_p": 0.9,
                "num_predict": max_tokens,
                # Large enough for the evidence bundle, small enough that CPU
                # inference stays responsive.
                "num_ctx": 4096,
            },
        }
        if json_mode:
            payload["format"] = "json"

        timeout = self.call_timeout()
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(f"{self._base_url}/api/chat", json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.ConnectError as exc:
            raise AIProviderError(
                "We could not reach the local AI service.",
                hint=f"Check that Ollama is running at {self._base_url} (`ollama serve`).",
            ) from exc
        except httpx.ReadTimeout as exc:
            raise AIProviderError(
                f"The AI model took longer than {timeout:.0f} seconds to respond.",
                hint="Try a smaller model, or raise AI_TIMEOUT_SECONDS.",
            ) from exc
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:300] if exc.response is not None else ""
            raise AIProviderError(
                "The local AI service returned an error.",
                details={"status": exc.response.status_code if exc.response else 0, "body": detail},
            ) from exc
        except httpx.HTTPError as exc:
            raise AIProviderError("The AI request failed.", details={"reason": str(exc)[:200]}) from exc

        content = (data.get("message") or {}).get("content", "")
        if not content:
            raise AIProviderError("The AI model returned an empty response.")
        return content


class OpenAICompatibleProvider(AIProvider):
    """Any endpoint speaking the OpenAI ``/chat/completions`` shape.

    Covers OpenAI itself, Together, Groq, OpenRouter, vLLM, and LM Studio.
    """

    name = "openai"

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self._base_url = (base_url or settings.openai_base_url).rstrip("/")
        self._api_key = api_key if api_key is not None else settings.openai_api_key
        self._model = model or settings.openai_model

    @property
    def model(self) -> str:
        return self._model

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    def health(self) -> ProviderHealth:
        if not self._api_key and "localhost" not in self._base_url and "127.0.0.1" not in self._base_url:
            return ProviderHealth(
                available=False,
                provider=self.name,
                model=self._model,
                detail="No API key is configured. Set OPENAI_API_KEY.",
            )
        started = time.perf_counter()
        try:
            with httpx.Client(timeout=8.0) as client:
                response = client.get(f"{self._base_url}/models", headers=self._headers())
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status in (401, 403):
                return ProviderHealth(
                    available=False, provider=self.name, model=self._model,
                    detail="The API key was rejected by the provider.",
                )
            # Some compatible servers do not implement /models; that alone does
            # not mean completions are unavailable.
            if status == 404:
                return ProviderHealth(
                    available=True, provider=self.name, model=self._model,
                    detail="Endpoint reachable (model listing not supported).",
                    latency_ms=int((time.perf_counter() - started) * 1000),
                )
            return ProviderHealth(
                available=False, provider=self.name, model=self._model,
                detail=f"The provider returned HTTP {status}.",
            )
        except httpx.HTTPError as exc:
            return ProviderHealth(
                available=False, provider=self.name, model=self._model,
                detail=f"Could not reach {self._base_url}: {exc}",
            )

        return ProviderHealth(
            available=True,
            provider=self.name,
            model=self._model,
            detail=f"Connected to {self._base_url}.",
            latency_ms=int((time.perf_counter() - started) * 1000),
        )

    def _generate(self, system: str, user: str, *, json_mode: bool, max_tokens: int) -> str:
        payload: dict[str, object] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.1,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        timeout = self.call_timeout()
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(
                    f"{self._base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.ReadTimeout as exc:
            raise AIProviderError(
                f"The AI provider took longer than {timeout:.0f} seconds to respond."
            ) from exc
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status in (401, 403):
                raise AIProviderError(
                    "The AI provider rejected the API key.",
                    hint="Check OPENAI_API_KEY in your environment configuration.",
                ) from exc
            if status == 429:
                raise AIProviderError(
                    "The AI provider is rate limiting requests. Try again shortly."
                ) from exc
            raise AIProviderError(
                "The AI provider returned an error.",
                details={"status": status},
            ) from exc
        except httpx.HTTPError as exc:
            raise AIProviderError(
                "We could not reach the AI provider.",
                details={"reason": str(exc)[:200]},
            ) from exc

        choices = data.get("choices") or []
        if not choices:
            raise AIProviderError("The AI provider returned no completions.")
        content = (choices[0].get("message") or {}).get("content", "")
        if not content:
            raise AIProviderError("The AI provider returned an empty response.")
        return content


@lru_cache(maxsize=1)
def get_provider() -> AIProvider:
    """The configured provider. Cached, and never raises on misconfiguration."""
    if not settings.ai_enabled or settings.ai_provider == "none":
        return NullProvider()
    if settings.ai_provider == "ollama":
        return OllamaProvider()
    if settings.ai_provider == "openai":
        return OpenAICompatibleProvider()
    logger.warning("unknown AI provider configured", extra={"provider": settings.ai_provider})
    return NullProvider()


def reset_provider_cache() -> None:
    """Used by tests and by settings changes."""
    get_provider.cache_clear()
