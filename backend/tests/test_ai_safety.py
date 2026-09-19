"""AI safety: structured output, guardrails, and graceful degradation.

The product's central claim is that the AI explains computed evidence and never
adds to it. These tests hold that line:

* invented figures are caught
* unhedged causal claims are caught
* malformed model output never reaches the user
* a dead provider degrades to deterministic output rather than an error
"""

from __future__ import annotations

import json

import pytest

from app.ai.base import AIProvider, NullProvider, extract_json, parse_into
from app.ai.guardrails import (
    check_causal_language,
    check_numbers,
    collect_text,
    extract_numbers,
    validate_response,
)
from app.ai.schemas import AnswerResponse, InvestigationNarrative
from app.ai.service import AIOutcome, _run, deterministic_answer
from app.core.errors import AIProviderError, AIResponseError


# --------------------------------------------------------------------------- #
# JSON extraction from imperfect model output
# --------------------------------------------------------------------------- #


class TestJSONExtraction:
    def test_plain_object(self):
        assert json.loads(extract_json('{"a": 1}')) == {"a": 1}

    def test_fenced_json_block(self):
        raw = 'Here you go:\n```json\n{"a": 1, "b": "two"}\n```\nHope that helps!'
        assert json.loads(extract_json(raw)) == {"a": 1, "b": "two"}

    def test_unlabelled_fence(self):
        assert json.loads(extract_json('```\n{"a": 1}\n```')) == {"a": 1}

    def test_leading_commentary(self):
        raw = 'Sure! Here is the JSON object you asked for: {"a": 1}'
        assert json.loads(extract_json(raw)) == {"a": 1}

    def test_trailing_commas_repaired(self):
        raw = '{"a": 1, "b": [1, 2, 3,],}'
        assert json.loads(extract_json(raw)) == {"a": 1, "b": [1, 2, 3]}

    def test_nested_braces_preserved(self):
        raw = '{"outer": {"inner": {"deep": 1}}, "list": [{"x": 2}]}'
        assert json.loads(extract_json(raw))["outer"]["inner"]["deep"] == 1

    def test_braces_inside_strings_do_not_confuse_the_parser(self):
        raw = '{"note": "a } brace and a { brace", "value": 5}'
        assert json.loads(extract_json(raw))["value"] == 5

    def test_empty_response_rejected(self):
        with pytest.raises(AIResponseError):
            extract_json("")

    def test_response_without_json_rejected(self):
        with pytest.raises(AIResponseError):
            extract_json("I am afraid I cannot help with that request.")

    def test_truncated_object_rejected(self):
        with pytest.raises(AIResponseError):
            extract_json('{"a": 1, "b": ')


class TestSchemaValidation:
    def test_valid_answer_parses(self):
        payload = json.dumps(
            {
                "headline": "Revenue fell 13.9%.",
                "summary": "Revenue fell from 224,075 to 193,032 month over month.",
                "observations": [],
                "possible_explanations": [],
                "recommended_actions": [],
                "confidence": "moderate",
            }
        )
        result = parse_into(payload, AnswerResponse)
        assert result.confidence == "moderate"

    def test_single_string_coerced_to_list(self):
        """Small models routinely return a string where a list was requested."""
        payload = json.dumps(
            {
                "headline": "Revenue fell.",
                "summary": "Revenue fell month over month.",
                "possible_explanations": "An inventory shortage coincided with it.",
                "recommended_actions": "Check stock records.",
                "confidence": "low",
            }
        )
        result = parse_into(payload, AnswerResponse)
        assert result.possible_explanations == ["An inventory shortage coincided with it."]
        assert result.recommended_actions == ["Check stock records."]

    def test_unknown_confidence_rejected(self):
        payload = json.dumps(
            {"headline": "X", "summary": "Y" * 20, "confidence": "extremely high"}
        )
        with pytest.raises(AIResponseError):
            parse_into(payload, AnswerResponse)

    def test_extra_fields_rejected(self):
        payload = json.dumps(
            {
                "headline": "X",
                "summary": "Y" * 20,
                "confidence": "low",
                "injected_field": "something the model made up",
            }
        )
        with pytest.raises(AIResponseError):
            parse_into(payload, AnswerResponse)

    def test_non_object_rejected(self):
        with pytest.raises(AIResponseError):
            parse_into("[1, 2, 3]", AnswerResponse)


# --------------------------------------------------------------------------- #
# Numeric guardrails — the anti-hallucination check
# --------------------------------------------------------------------------- #


class TestNumericGuardrails:
    def test_extracts_formatted_numbers(self):
        found = extract_numbers("Revenue was $224,075.84, down 13.9% from 260,000.")
        assert 224075.84 in found
        assert 13.9 in found
        assert 260000.0 in found

    def test_supported_figures_pass(self):
        ok, unsupported = check_numbers(
            "Revenue fell from 224,075.84 to 193,032.93.", [224075.84, 193032.93]
        )
        assert ok and unsupported == []

    def test_invented_figure_is_caught(self):
        """This is the check the whole product rests on."""
        ok, unsupported = check_numbers(
            "Revenue fell to 193,032.93 after a 45,000 marketing overspend.",
            [224075.84, 193032.93],
        )
        assert not ok
        assert 45000.0 in unsupported

    def test_rounding_is_allowed(self):
        ok, _ = check_numbers("Revenue was about 224,076.", [224075.84])
        assert ok

    def test_percentage_rounding_is_allowed(self):
        ok, _ = check_numbers("Revenue fell 13.9%.", [13.85])
        assert ok

    def test_difference_between_two_evidence_values_is_allowed(self):
        # 224075.84 - 193032.93 = 31042.91
        ok, unsupported = check_numbers(
            "That is a fall of 31,042.91.", [224075.84, 193032.93]
        )
        assert ok, unsupported

    def test_restating_at_a_different_magnitude_is_allowed(self):
        ok, _ = check_numbers("Revenue was roughly 224 thousand.", [224075.84])
        assert ok

    def test_small_counts_and_ordinals_are_allowed(self):
        ok, _ = check_numbers("The top 3 products account for most of it.", [61.8])
        assert ok

    def test_years_are_allowed(self):
        ok, _ = check_numbers("In August 2026 revenue fell.", [13.85])
        assert ok

    def test_guardrail_sees_text_nested_in_lists(self):
        response = AnswerResponse(
            headline="Revenue fell.",
            summary="Revenue fell month over month.",
            possible_explanations=["A 99,999 unit shortfall was recorded."],
            confidence="low",
        )
        result = validate_response(collect_text(response), [100.0, 200.0])
        assert not result.passed
        assert 99999.0 in result.unsupported_numbers


class TestCausalGuardrails:
    def test_unhedged_causal_claim_is_caught(self):
        ok, sentences = check_causal_language(
            "Revenue fell because of the Product B stockout."
        )
        assert not ok and sentences

    @pytest.mark.parametrize(
        "text",
        [
            "The stockout may have caused the decline.",
            "The decline could be due to the stockout.",
            "This is consistent with an inventory shortage.",
            "The two events coincide in time.",
            "The shortage possibly led to fewer sales.",
            "The data suggests it resulted from lower traffic.",
        ],
    )
    def test_hedged_claims_are_allowed(self, text: str):
        ok, sentences = check_causal_language(text)
        assert ok, sentences

    def test_hedge_must_be_in_the_same_sentence(self):
        """A hedge elsewhere in the response must not license an assertion here."""
        text = (
            "Results may vary from month to month. "
            "Revenue fell because of the Product B stockout."
        )
        ok, sentences = check_causal_language(text)
        assert not ok
        assert len(sentences) == 1

    def test_plain_observations_pass(self):
        ok, _ = check_causal_language(
            "Revenue fell 13.9%. Product B accounted for 61.8% of the decline."
        )
        assert ok


class TestGuardrailResult:
    def test_reason_describes_the_failure(self):
        result = validate_response(
            "Revenue fell 50,000 because of the stockout.", [100.0]
        )
        assert not result.passed
        assert "not present" in result.reason
        assert "cause" in result.reason


# --------------------------------------------------------------------------- #
# Graceful degradation
# --------------------------------------------------------------------------- #


class _BrokenProvider(AIProvider):
    name = "broken"

    @property
    def model(self) -> str:
        return "broken-model"

    def health(self):
        from app.ai.schemas import ProviderHealth

        return ProviderHealth(available=False, provider=self.name, detail="down")

    def _generate(self, system, user, *, json_mode, max_tokens):
        raise AIProviderError("The AI provider is unreachable.")


class _GarbageProvider(_BrokenProvider):
    name = "garbage"

    def _generate(self, system, user, *, json_mode, max_tokens):
        return "I'm sorry, I can't do that."


class _HallucinatingProvider(_BrokenProvider):
    name = "hallucinating"

    def _generate(self, system, user, *, json_mode, max_tokens):
        return json.dumps(
            {
                "headline": "Revenue fell because of a 77,777 competitor campaign.",
                "summary": "A competitor spent 77,777 on advertising, which caused the fall.",
                "observations": [],
                "possible_explanations": [],
                "recommended_actions": [],
                "confidence": "high",
            }
        )


FALLBACK = {"headline": "deterministic", "summary": "computed without a model"}


class TestGracefulDegradation:
    def test_unreachable_provider_falls_back(self):
        outcome = _run(
            system="s", user="u", schema=AnswerResponse,
            allowed_values=[1.0], fallback=FALLBACK, provider=_BrokenProvider(),
        )
        assert outcome.is_fallback
        assert outcome.structured == FALLBACK
        assert "unreachable" in outcome.error

    def test_unparseable_output_falls_back(self):
        outcome = _run(
            system="s", user="u", schema=AnswerResponse,
            allowed_values=[1.0], fallback=FALLBACK, provider=_GarbageProvider(),
        )
        assert outcome.is_fallback
        assert outcome.structured == FALLBACK

    def test_hallucinated_figures_are_rejected(self):
        outcome = _run(
            system="s", user="u", schema=AnswerResponse,
            allowed_values=[224075.84, 193032.93],
            fallback=FALLBACK, provider=_HallucinatingProvider(),
        )
        assert outcome.is_fallback
        assert outcome.structured == FALLBACK
        assert "77,777" in outcome.error or "77777" in outcome.error

    def test_null_provider_reports_unavailable_without_raising(self):
        provider = NullProvider()
        assert provider.health().available is False
        with pytest.raises(AIProviderError):
            provider.complete_text(system="s", user="u")


class TestDeterministicAnswer:
    def test_answer_is_complete_without_any_model(self, novamart_context):
        from app.analytics.executor import answer_question

        ctx, _ = novamart_context
        execution = answer_question("Why did revenue decline?", ctx)
        answer = deterministic_answer(execution)

        assert answer["headline"]
        assert answer["observations"]
        assert answer["confidence"] in {"low", "moderate", "high"}
        # It must itself satisfy the guardrails we hold the model to.
        result = validate_response(collect_text(answer), execution.evidence_values())
        assert result.passed, result.to_dict()

    def test_unanswerable_question_says_so(self, novamart_context):
        from app.analytics.executor import answer_question

        ctx, _ = novamart_context
        execution = answer_question("zzzz qqqq wwww", ctx)
        answer = deterministic_answer(execution)
        assert "could not tell" in answer["summary"].lower() or execution.insufficient
