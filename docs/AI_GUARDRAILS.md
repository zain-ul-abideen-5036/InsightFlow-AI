# AI guardrails

InsightFlow makes one central promise:

> **The AI may explain the evidence. It may not add to it.**

This document describes how that is enforced, what it deliberately does not
cover, and how to verify it yourself.

---

## 1. Why the split exists

A language model asked to summarise financial data will occasionally produce a
figure that appears nowhere in its input, or promote a coincidence to a cause.
Both are unacceptable in a product someone uses to decide what to do about their
business, and both are invisible: a wrong number and a right number look
identical on the page.

So the two jobs are separated.

```
your data
    │
    ▼
deterministic analytics engine          ← every number is produced here
    │  pandas · numpy · scipy · scikit-learn
    │
    ▼
structured analytical result
    │
    ▼
evidence bundle                          ← aggregates, labels, periods, calculations
    │
    ▼
language model                           ← phrases it, produces no figures of its own
    │
    ▼
validation against the bundle            ← anything unsupported is discarded
    │
    ▼
what you see
```

The model never sees a row of your file. It receives computed findings and is
asked to write them up. Whatever it writes is then checked back against those
findings before it is rendered.

**The load-bearing consequence:** turn the AI off and the product still works.
`AI_ENABLED=false` and the whole test suite passes, because the analysis, the
metrics, the trends, the anomalies, the investigations, and the reports are all
produced without a model. The explanations are written by the engine instead, in
plainer prose. That is the only difference.

---

## 2. The five epistemic statuses

Every statement the product makes carries one of these, and the interface
renders each differently. The distinction between the third and the fourth is
the one that matters most.

| Status | Means | Example |
| --- | --- | --- |
| **Observed fact** | Read or summed directly from the data | "Revenue was USD 193,033 in Aug 2026." |
| **Statistical finding** | Computed by a named method | "Revenue fell 13.9% against the previous month." |
| **Correlation** | Two things moved together | "Product B sales fell 31% over the same days inventory read zero." |
| **Possible explanation** | A hypothesis the evidence is consistent with | "An inventory shortage is consistent with the decline, though the data cannot confirm it." |
| **Recommendation** | A suggested next check | "Confirm whether Product B was purchasable during that period." |

In code these are `EvidenceKind` (`observation`, `statistical`, `correlation`,
`comparison`, `data_quality`) and `Finding.kind`
(`observation`, `statistical`, `correlation`, `possible_explanation`).

A `possible_explanation` is never rendered in the same visual treatment as an
observation. On the investigation page it sits on a different surface, in muted
text, under a heading that says "Possible explanations". That styling is doing
real work: it is the difference between "this is what the data shows" and "this
might be why".

---

## 3. The numeric guardrail

`app/ai/guardrails.py::check_numbers`

Every numeric token in the generated text is extracted and matched against the
evidence bundle. Anything unmatched is a fabrication and the whole response is
discarded.

### What counts as a match

- **Exact equality.**
- **Rounding**, within 2% relative or 0.51 absolute. A model writing "18.4%"
  against a computed 18.42% is reporting correctly, not inventing.
- **The difference between any two evidence values.** Evidence holds 43,142 and
  23,949; the text "a fall of 19,193" is a correct derivation, not a new claim.
- **A value's magnitude**, so a sign change in phrasing is not an invention.
- **Downward rescaling.** 42,100 may be written as "42.1 thousand" or
  "0.04 million".

### What is exempt

- Ordinals and small counts: 0, 1, 2, 3, 4, 5, 10, 100. "The top 3 products" is
  not a claim about quantity.
- Four-digit integers between 1900 and 2200, which are years.
- Anything under 0.01.
- **Dates and times**, which are removed before extraction — see below.

### Two things this gets right that are easy to get wrong

**Rescaling is one-directional.** Allowing 100 to license "100,000" would be
catastrophic, because the tolerance is relative to the rescaled figure: a window
thousands of units wide would open around every small number in the evidence.
Only downward rescaling is permitted.

**Dates are not quantities.** `2026-03-14` contains the substrings `-03` and
`-14`. Read as numbers they are two figures the analysis never produced, so a
naive implementation reports a fabrication in text that is entirely correct.
Because every anomaly, period comparison, and investigation names a date, this
rejects nearly every answer the product can give — and does so silently, falling
back to deterministic prose while logging that the model invented figures it
never wrote. `strip_dates` removes ISO dates, timestamps, `DD/MM/YYYY` forms,
and the engine's own labels (`24 Aug 2026`, `Aug 2026`, `Q3 2026`) before any
number is extracted.

### The invariant behind it

The guardrail is only as good as the evidence bundle. A figure that the engine
*writes* but does not *record* is indistinguishable from one a model invented,
so a correct answer quoting it gets thrown away.

`tests/test_ai_adversarial.py::TestEvidenceCompleteness` therefore sweeps 27
questions across all four grains and asserts that the engine's own prose passes
the guardrail it holds the model to. Three real defects were found this way:
segment shares, contribution percentages, and the smallest-segment row were all
quoted in prose while being carried only inside `Evidence.detail`, where
`evidence_values()` never looked.

---

## 4. The causal guardrail

`app/ai/guardrails.py::check_causal_language`

The analytics layer only ever establishes co-occurrence. Nothing in a
spreadsheet of orders can establish causation, so nothing the product says may
assert it.

Unhedged causal language is rejected:

> `caused by` · `was caused` · `caused the` · `because of` · `due to` ·
> `resulted from` · `resulted in` · `led to` · `drove the` · `is the reason` ·
> `responsible for` · `as a result of`

A hedge in the **same sentence** makes the claim acceptable, because it reframes
it as a hypothesis:

> `may` · `might` · `could` · `possibl…` · `potential…` · `likely` · `appears` ·
> `suggests` · `consistent with` · `coincide…` · `associated with` · `seems` ·
> `probabl…` · `indicat…` · `cannot confirm`

**Evaluated per sentence, deliberately.** A model that opens with "this may be
related" and then states a cause two sentences later has still stated a cause,
and that is the sentence a reader will quote.

### Worked example

Rejected:

> Product B caused the revenue decline.

Accepted:

> Revenue fell 13.9%. Product B accounts for 61.8% of that change. Inventory
> records show zero available units on 7 days in the period. The stockout
> coincides with the decline; an inventory shortage is consistent with what the
> data shows, though the data alone cannot confirm it as the cause.

Both sentences describe the same situation. Only the second is supportable.

---

## 5. When the model fails

Every failure mode degrades to the deterministic answer. None of them produce an
error the user sees.

| Failure | Behaviour |
| --- | --- |
| Provider unreachable | Deterministic answer; provider status shown in Settings |
| Timeout | Deterministic answer |
| Response is not JSON | One repair attempt, then deterministic answer |
| JSON does not match the schema | One repair attempt, then deterministic answer |
| Response cites an unsupported figure | Discarded; deterministic answer |
| Response asserts an unhedged cause | Discarded; deterministic answer |
| `AI_ENABLED=false` | Deterministic answer, no call attempted |

The deterministic answer is not a degraded placeholder. Every statement in it
was written by the engine from computed figures, which makes it the most
trustworthy form the answer takes. It is plainer prose. That is the only
difference, and the interface says which one you are reading
("Written from the computed analysis" against "Explained by *model*").

---

## 6. What the model receives

Exactly this, and nothing else:

- Aggregated metrics — totals, averages, percentage changes
- Segment names, such as product, region, and channel labels
- Period labels, and the named calculation behind each figure
- Your question text

**Individual rows of your file are never sent.** `AI_MAX_SAMPLE_ROWS` exists as
a hard ceiling for any future feature that might need row-level context; nothing
currently uses it, and if anything ever does, the interface will say so.

With `AI_PROVIDER=ollama` the model runs locally and nothing leaves the machine
at all. Settings → AI & data shows the active provider and the exact list above,
generated from the running configuration rather than written by hand.

---

## 7. Two-phase investigation

Local CPU inference takes 60–180 seconds. The evidence — what moved, where, by
how much, what coincided with it — is complete before a single token is
generated.

So the investigation endpoint separates them:

1. `POST /anomalies/{id}/investigate?narrate=false` returns the deterministic
   investigation immediately, with `narrative_pending: true`.
2. The page renders it, then asks again with `narrate=true`.
3. The generated prose replaces the engine's, and is **cached on the anomaly**,
   so the wait is paid once per anomaly rather than once per visit.

Before the cache existed, reopening an investigation silently downgraded its
prose: the deterministic result was stored but the generated text was not.

---

## 8. Verifying it

```bash
cd backend

# The mechanisms: JSON extraction, schema validation, guardrails, degradation
pytest tests/test_ai_safety.py -q

# The attacks: unanswerable questions, fabrication, causal overreach,
# malformed output, evidence completeness
pytest tests/test_ai_adversarial.py -q
```

`test_ai_adversarial.py` covers, among others:

- A period outside the data (`"What was revenue in 2018?"` on a 2025 dataset)
- A metric with no supporting column (`"How many customers do I have?"` with no
  customer identifier) — which must say so, never report zero
- A leading question (`"Prove the Nova Air Purifier caused the decline."`)
- Fabricated figures, dates, percentages, counts, and column names
- Figures hidden inside nested lists
- Upward rescaling as a fabrication vector
- Seven shapes of malformed model output
- A well-formed, fully supported response, which must be **accepted** — without
  that control, every other test would pass on an implementation that discarded
  all model output

---

## 9. What this does not cover

Stated plainly, because a guardrail described as more than it is becomes a
liability.

- **Non-numeric falsehoods.** A model could describe a trend in the wrong
  direction using only supported figures. The structured schema and the short,
  heavily-constrained prompts make this unlikely; nothing detects it.
- **Segment names.** Only figures are matched against the evidence. A
  hallucinated product name would pass the numeric check. The prompts supply the
  real labels and the deterministic summary is always available for comparison.
- **Prompt injection through data.** Column names and segment labels come from
  an uploaded file and reach the prompt. They are length-bounded and arrive as
  structured fields rather than free text, and a successful injection could at
  worst change the wording — every figure would still be validated.
- **Semantic correctness of the analysis itself.** The guardrails check that the
  *writing* matches the *computation*. That the computation is right is the job
  of `tests/test_analytics_math.py`, which asserts hand-verified answers.

---

## 10. Where the code is

| Concern | File |
| --- | --- |
| Guardrails | `backend/app/ai/guardrails.py` |
| Provider abstraction, JSON extraction, repair | `backend/app/ai/base.py` |
| Providers (Ollama, OpenAI-compatible, null) | `backend/app/ai/providers.py` |
| Prompts | `backend/app/ai/prompts.py` |
| Structured response schemas | `backend/app/ai/schemas.py` |
| Orchestration and deterministic fallbacks | `backend/app/ai/service.py` |
| Evidence types | `backend/app/analytics/types.py` |
| Evidence production | `backend/app/analytics/executor.py` |
| Investigation findings | `backend/app/analytics/investigation.py` |
