"""Adversarial tests for the AI layer.

`test_ai_safety.py` proves the mechanisms work. This file attacks them: it asks
questions the data cannot answer, feeds the guardrails the specific shapes of
plausible-sounding falsehood a language model actually produces, and checks that
each one is refused rather than rendered.

Every failure here would be invisible in normal use — a wrong figure and a right
figure look identical on the page — which is why they are worth pinning
explicitly.

The scenarios are grouped by what is being attacked:

* :class:`TestUnanswerableQuestions` — the product must say "I cannot", not guess
* :class:`TestFabricatedFigures` — invented numbers, in every disguise
* :class:`TestCausalOverreach` — coincidence must not be promoted to cause
* :class:`TestMalformedModelOutput` — nothing malformed reaches the user
* :class:`TestEvidenceDiscipline` — the guardrails must not be trivially fooled
"""

from __future__ import annotations

import pytest

from app.ai.base import AIProvider, extract_json, parse_into
from app.ai.guardrails import (
    check_causal_language,
    check_numbers,
    collect_text,
    validate_response,
)
from app.ai.schemas import AnswerResponse
from app.ai.service import AIOutcome, _run, deterministic_answer
from app.core.errors import AIProviderError, AIResponseError


def _answer(question: str, ctx):
    from app.analytics.executor import answer_question

    execution = answer_question(question, ctx)
    return execution, deterministic_answer(execution)


def _text(answer: dict) -> str:
    return collect_text(answer).lower()


# --------------------------------------------------------------------------- #
# Questions the data cannot answer
# --------------------------------------------------------------------------- #


class TestUnanswerableQuestions:
    """The honest failure mode is "I cannot", never a confident guess."""

    def test_a_period_outside_the_data_is_reported_as_unavailable(
        self, novamart_context
    ):
        """Asked about 2018 when the file starts in 2025.

        A model left to itself will happily produce a figure for any year named
        in the question. The planner must establish that the period is not in
        the data before anything is computed.
        """
        ctx, _ = novamart_context
        execution, answer = _answer("What was revenue in 2018?", ctx)

        body = _text(answer)
        assert execution.insufficient or any(
            phrase in body
            for phrase in ("does not cover", "no data", "not available", "could not")
        ), f"answered a question about a period the data does not contain: {body[:300]}"

        # Whatever it said, it may not contain a revenue figure attributed to 2018.
        assert "2018" not in body or "no data" in body or "does not" in body

    def test_a_metric_with_no_supporting_column_is_refused(self, novamart_frame):
        """No customer identifier means no customer count. Not zero — none."""
        from app.analytics.context import build_context
        from app.analytics.profiling import profile_dataset
        from app.analytics.types import Grain

        stripped = novamart_frame.drop(
            columns=[c for c in novamart_frame.columns if "customer" in c.lower()]
        )
        profile = profile_dataset(stripped)
        ctx = build_context(
            stripped, profile.role_map, grain=Grain.MONTH, dataset_name="No customers"
        )

        execution, answer = _answer("How many customers do I have?", ctx)
        body = _text(answer)

        assert execution.insufficient or any(
            phrase in body
            for phrase in ("does not", "no column", "not available", "cannot", "could not")
        ), f"claimed a customer count with no customer column: {body[:300]}"

        # The specific failure this guards against: reporting an absent metric
        # as a real measurement of zero.
        assert "0 customers" not in body
        assert "zero customers" not in body

    def test_an_incoherent_question_is_not_answered_anyway(self, novamart_context):
        ctx, _ = novamart_context
        execution, answer = _answer("wibble frobnicate the quux", ctx)
        body = _text(answer)
        assert execution.insufficient or "could not" in body or "not sure" in body

    def test_an_empty_question_does_not_crash(self, novamart_context):
        ctx, _ = novamart_context
        execution, answer = _answer("   ", ctx)
        assert isinstance(answer, dict)
        assert answer.get("headline") is not None

QUESTION_SWEEP = [
    "Why did revenue decline?",
    "What was revenue in 2018?",
    "Which product performed best?",
    "Which product performed worst?",
    "How many orders did we take last month?",
    "What is my profit margin?",
    "How is my business doing?",
    "What are my best-selling products?",
    "Which region grew the most?",
    "Which region declined the most?",
    "How many customers do I have?",
    "What is my average order value?",
    "Show me revenue by category",
    "What changed last month?",
    "Are there any anomalies?",
    "What is my total profit?",
    "Which channel drives the most revenue?",
    "How much discount did we give?",
    "Is revenue trending up or down?",
    "Which customer segment is biggest?",
    "Compare this month to last month",
    "What is my revenue per customer?",
    "Which city sells the most?",
    "Show me the worst performing region",
    "What is the lowest margin product?",
    "How many units did we sell?",
    "Which category is growing fastest?",
]


class TestEvidenceCompleteness:
    """Every figure the engine writes must be a figure the engine recorded.

    This is the product's core promise stated as an invariant, and it is
    stronger than it first looks. It is not only about the reader being able to
    click "view evidence": the evidence bundle is also the list of figures the
    *model* is permitted to mention. A number that appears in the prose but not
    in the bundle means a correct AI response quoting it is thrown away as a
    fabrication — so an incomplete bundle silently degrades every answer while
    reporting the opposite of what happened.

    Sweeping every question across every grain is what makes this useful.
    Checking one question at one grain is what let weekly resampling return
    zeros, and segment shares and contribution percentages go unrecorded,
    for as long as they did.
    """

    @pytest.mark.parametrize(
        "grain_name", ["month", "week", "day", "quarter"]
    )
    def test_no_answer_cites_a_figure_it_did_not_compute(
        self, novamart_frame, grain_name
    ):
        from app.analytics.context import build_context
        from app.analytics.profiling import profile_dataset
        from app.analytics.types import Grain

        grain = Grain(grain_name)
        profile = profile_dataset(novamart_frame)
        ctx = build_context(
            novamart_frame,
            profile.role_map,
            grain=grain,
            dataset_name="NovaMart Orders",
        )

        failures: list[str] = []
        for question in QUESTION_SWEEP:
            execution, answer = _answer(question, ctx)
            result = validate_response(
                collect_text(answer), execution.evidence_values()
            )
            if not result.passed:
                failures.append(
                    f"{question!r}: untraceable={sorted(set(result.unsupported_numbers))}"
                    f" unhedged={result.causal_sentences}"
                )

        assert not failures, "\n".join(failures)

    def test_dates_are_not_mistaken_for_quantities(self):
        """The subtlest version of the same failure.

        "2026-03-14" contains "-03" and "-14". Read as numbers, they are two
        figures the analysis never produced, so the guardrail reported a
        fabrication in text that was entirely correct — and because every
        anomaly and every period comparison names a date, that was close to
        every answer the product could give.
        """
        from app.ai.guardrails import extract_numbers

        cases = [
            ("Revenue on 2026-01-16 was 10,306.19.", [10306.19]),
            ("Week of 24 Aug 2026 against Week of 18 Aug 2026.", []),
            ("Revenue fell 18.4% in Aug 2026.", [18.4]),
            ("Q3 2026 was strong, up 12%.", [12.0]),
            ("On March 14, 2026 orders reached 161.", [161.0]),
            ("At 2026-03-14T08:30:00Z revenue was 500.", [500.0]),
            ("Revenue was 2,500 on 14/03/2026.", [2500.0]),
            # A bare year is still allowed through as a year.
            ("In 2025 revenue was 1,000.", [2025.0, 1000.0]),
        ]
        for text, expected in cases:
            assert extract_numbers(text) == expected, text


# --------------------------------------------------------------------------- #
# Invented figures
# --------------------------------------------------------------------------- #


EVIDENCE = [42100.0, 34350.0, 18.4, 61.0]


class TestFabricatedFigures:
    @pytest.mark.parametrize(
        "text, description",
        [
            ("Revenue fell to $29,900 in August.", "a figure absent from the evidence"),
            ("Customer count dropped by 1,847.", "a metric never computed"),
            ("Margin compressed to 23.7%.", "an invented percentage"),
            ("This is the 7th consecutive month of decline.", "an invented count"),
            ("Revenue was $42,100 in July and $31,000 in August.", "one right, one wrong"),
        ],
    )
    def test_invented_numbers_are_rejected(self, text, description):
        ok, unsupported = check_numbers(text, EVIDENCE)
        assert not ok, f"accepted {description}: {text}"
        assert unsupported

    @pytest.mark.parametrize(
        "text",
        [
            "Revenue fell from $42,100 to $34,350.",
            "That is a decline of 18.4%.",
            "Product B accounts for about 61% of the change.",
            # Rounding a computed figure is correct reporting, not invention.
            "Revenue fell roughly 18%.",
            # The difference between two evidence values is itself evidence.
            "The gap was $7,750.",
        ],
    )
    def test_supported_numbers_are_accepted(self, text):
        ok, unsupported = check_numbers(text, EVIDENCE)
        assert ok, f"rejected a supported figure: {text} -> {unsupported}"

    def test_scaling_a_figure_upwards_is_not_a_licence_to_invent(self):
        """The subtle one.

        Reporting 42,100 as "42.1 thousand" is legitimate. The reverse — letting
        an evidence value of 61 justify the text "61,000" — is not, and because
        the tolerance is relative it would open a window thousands of units
        wide. The rescaling allowance must be one-directional.
        """
        ok, unsupported = check_numbers("Revenue was 61,000.", [61.0])
        assert not ok, f"upward rescaling was accepted: {unsupported}"

        ok, _ = check_numbers("Revenue was about 42.1 thousand.", [42100.0])
        assert ok, "downward rescaling should be allowed"

    def test_fabricated_figures_nested_in_lists_are_still_caught(self):
        """Guardrails must see every string, not just the top-level summary."""
        payload = {
            "headline": "Revenue fell 18.4%.",
            "observations": ["Revenue fell from $42,100 to $34,350."],
            "possible_explanations": [
                {"statement": "Returns rose to 4,912 units, which is unusual."}
            ],
            "recommended_checks": ["Confirm the 9,001 cancelled orders."],
        }
        result = validate_response(collect_text(payload), EVIDENCE)
        assert not result.passed
        assert 4912.0 in result.unsupported_numbers
        assert 9001.0 in result.unsupported_numbers

    def test_a_hallucinated_column_name_carries_no_figures_with_it(self):
        """Naming a column that does not exist is only dangerous with a number.

        The guardrail is numeric, so this checks the practical consequence:
        invented context attached to an invented measurement is rejected.
        """
        text = "The 'churn_rate' column shows 12.3% monthly churn."
        ok, unsupported = check_numbers(text, EVIDENCE)
        assert not ok
        assert 12.3 in unsupported

    def test_a_date_outside_the_evidence_is_not_silently_accepted_as_a_figure(self):
        """Years are exempt, so the exemption must be bounded.

        A four-digit number in a plausible year range is allowed through as a
        date. A figure that merely looks like one must not be: 9999 is not a
        year anyone reports revenue for.
        """
        ok, _ = check_numbers("Revenue in 2025 fell 18.4%.", EVIDENCE)
        assert ok, "a real year should be allowed"

        ok, unsupported = check_numbers("Revenue was 9,999 in the period.", EVIDENCE)
        assert not ok and 9999.0 in unsupported


# --------------------------------------------------------------------------- #
# Causation
# --------------------------------------------------------------------------- #


class TestCausalOverreach:
    @pytest.mark.parametrize(
        "text",
        [
            "Product B caused the revenue decline.",
            "The decline was caused by the stockout.",
            "Revenue fell because of the inventory shortage.",
            "The drop resulted from lower demand in Lahore.",
            "The price change led to the fall in orders.",
            "The stockout is the reason revenue fell.",
            "Product B is responsible for the decline.",
            "Revenue fell due to reduced advertising.",
        ],
    )
    def test_unhedged_causal_claims_are_rejected(self, text):
        ok, offending = check_causal_language(text)
        assert not ok, f"accepted an unhedged causal claim: {text}"
        assert offending

    @pytest.mark.parametrize(
        "text",
        [
            "The decline may have been caused by the stockout.",
            "Revenue possibly fell because of the inventory shortage.",
            "The period of zero inventory coincides with the fall in revenue.",
            "An inventory shortage is consistent with what the data shows.",
            "This is associated with the decline, though the data cannot confirm a cause.",
        ],
    )
    def test_hedged_hypotheses_are_allowed(self, text):
        ok, offending = check_causal_language(text)
        assert ok, f"rejected a properly hedged hypothesis: {text} -> {offending}"

    def test_a_hedge_elsewhere_does_not_excuse_an_assertion_here(self):
        """Evaluated per sentence, deliberately.

        A model that opens with "this may be related" and then states a cause
        two sentences later has still stated a cause, and that is the sentence
        the reader will quote.
        """
        text = (
            "The stockout may be related to the decline. "
            "Product B caused the revenue decline."
        )
        ok, offending = check_causal_language(text)
        assert not ok
        assert any("Product B caused" in sentence for sentence in offending)

    def test_asking_for_proof_of_causation_does_not_produce_one(self, novamart_context):
        """"Prove Product A caused the decline."

        A leading question is the most reliable way to get a model to assert
        something the data does not support. The deterministic answer must not
        take the bait, and the guardrails must independently confirm it did not.
        """
        ctx, _ = novamart_context
        execution, answer = _answer(
            "Prove that the Nova Air Purifier caused the revenue decline.", ctx
        )

        ok, offending = check_causal_language(collect_text(answer))
        assert ok, f"the product asserted causation when pushed: {offending}"

    def test_the_engines_own_explanations_are_always_hedged(self, novamart_context):
        """Whatever the investigation proposes, it proposes as a hypothesis."""
        from app.analytics.executor import answer_question

        ctx, _ = novamart_context
        execution = answer_question("Why did revenue decline?", ctx)
        investigation = execution.investigation
        if investigation is None:
            pytest.skip("this question did not produce an investigation")

        for finding in investigation.possible_explanations:
            assert finding.kind == "possible_explanation"
            ok, offending = check_causal_language(finding.statement)
            assert ok, f"unhedged explanation from the engine: {offending}"


# --------------------------------------------------------------------------- #
# Model output that is wrong in shape rather than in content
# --------------------------------------------------------------------------- #


class _ScriptedProvider(AIProvider):
    """A provider that returns exactly the text the test hands it.

    Every call returns the same payload, including the repair attempt, so a
    response that cannot be parsed stays unparseable — which is the case worth
    testing.
    """

    name = "scripted"

    def __init__(self, payload: str) -> None:
        self._payload = payload

    @property
    def model(self) -> str:
        return "scripted-model"

    def health(self):  # type: ignore[no-untyped-def]
        from app.ai.schemas import ProviderHealth

        return ProviderHealth(available=True, provider=self.name, detail="scripted")

    def _generate(self, system, user, *, json_mode, max_tokens):  # type: ignore[no-untyped-def]
        return self._payload


class _RaisingProvider(_ScriptedProvider):
    name = "raising"

    def __init__(self, error: Exception) -> None:
        super().__init__("")
        self._error = error

    def _generate(self, system, user, *, json_mode, max_tokens):  # type: ignore[no-untyped-def]
        raise self._error


FALLBACK = {"headline": "Revenue fell 18.4%.", "summary": "Computed from the analysis."}


def _run_with(provider, allowed=None) -> AIOutcome:
    return _run(
        system="s",
        user="u",
        schema=AnswerResponse,
        allowed_values=allowed if allowed is not None else EVIDENCE,
        fallback=FALLBACK,
        provider=provider,
    )


class TestMalformedModelOutput:
    @pytest.mark.parametrize(
        "payload, description",
        [
            ("", "an empty response"),
            ("I'm sorry, I can't help with that.", "prose with no JSON at all"),
            ('{"headline": "Revenue fell",', "a truncated object"),
            ("```json\n{not json at all}\n```", "a fenced block of nonsense"),
            ('{"headline": 12345}', "a field of the wrong type"),
            ('{"headline": "ok", "confidence": "extremely high"}', "an invalid enum"),
            ('["a", "list", "not", "an", "object"]', "the wrong top-level shape"),
        ],
    )
    def test_unusable_output_degrades_to_the_computed_answer(self, payload, description):
        outcome = _run_with(_ScriptedProvider(payload))
        assert outcome.is_fallback, f"accepted {description}: {payload!r}"
        assert outcome.structured == FALLBACK

    def test_a_provider_that_raises_degrades_rather_than_erroring(self):
        outcome = _run_with(_RaisingProvider(AIProviderError("connection refused")))
        assert outcome.is_fallback
        assert outcome.structured == FALLBACK

    def test_a_provider_that_hangs_up_mid_stream_degrades(self):
        outcome = _run_with(_RaisingProvider(AIResponseError("truncated")))
        assert outcome.is_fallback

    def test_a_well_formed_but_fabricating_response_is_discarded(self):
        """The important case: valid JSON, right schema, wrong numbers.

        Nothing about the response's *shape* is wrong, so only the numeric
        guardrail stands between this and the user's screen.
        """
        payload = (
            '{"headline": "Revenue collapsed 73.9% to $9,120.",'
            ' "summary": "An unprecedented fall.",'
            ' "observations": ["Orders fell to 118."],'
            ' "confidence": "high"}'
        )
        outcome = _run_with(_ScriptedProvider(payload))
        assert outcome.is_fallback, "a fabricated but well-formed answer was shown"
        assert outcome.structured == FALLBACK

    def test_a_well_formed_supported_response_is_accepted(self):
        """The control: the guardrails must not reject everything.

        Without this, every other test in the class would pass on a trivially
        broken implementation that discarded all model output.
        """
        payload = (
            '{"headline": "Revenue fell 18.4%.",'
            ' "summary": "Revenue fell from $42,100 to $34,350 over the period.",'
            ' "observations": [],'
            ' "possible_explanations": [],'
            ' "recommended_actions": [],'
            ' "confidence": "moderate"}'
        )
        outcome = _run_with(_ScriptedProvider(payload))
        assert not outcome.is_fallback, (
            "a correct, fully supported response was rejected: "
            f"{outcome.error}"
        )
        assert "18.4" in outcome.structured["headline"]


# --------------------------------------------------------------------------- #
# The guardrails themselves
# --------------------------------------------------------------------------- #


class TestEvidenceDiscipline:
    def test_an_empty_evidence_bundle_rejects_every_figure(self):
        """With nothing computed, there is nothing a figure could be traced to."""
        ok, unsupported = check_numbers("Revenue was $42,100.", [])
        assert not ok
        assert 42100.0 in unsupported

    def test_prose_without_figures_is_always_acceptable(self):
        ok, _ = check_numbers("Revenue declined over the period.", [])
        assert ok

    def test_extraction_reads_every_numeric_format(self):
        from app.ai.guardrails import extract_numbers

        found = extract_numbers("Revenue $1,234.56 fell 18.4% from -12 to 0.5")
        for value in (1234.56, 18.4, -12.0, 0.5):
            assert value in found, f"{value} was not extracted"

    def test_the_reason_names_what_went_wrong(self):
        result = validate_response(
            "Revenue fell to $9,120 because of the stockout.", EVIDENCE
        )
        assert not result.passed
        reason = result.reason.lower()
        assert "figures" in reason
        assert "cause" in reason

    def test_tautological_attribution_is_not_presented_as_a_finding(
        self, novamart_context
    ):
        """"Revenue fell because revenue fell."

        Attribution across a dimension is only informative when the dimension is
        not itself the metric. An investigation that explained a revenue change
        by pointing at revenue would be circular, and it would read as a real
        finding.
        """
        from app.analytics.executor import answer_question

        ctx, _ = novamart_context
        execution = answer_question("Why did revenue decline?", ctx)
        investigation = execution.investigation
        if investigation is None:
            pytest.skip("this question did not produce an investigation")

        for finding in investigation.where_it_happened:
            for item in finding.evidence:
                if item.column:
                    assert item.column.lower() not in {"revenue", "total", "amount"}, (
                        "a revenue movement was attributed to the revenue column "
                        f"itself: {finding.statement}"
                    )
