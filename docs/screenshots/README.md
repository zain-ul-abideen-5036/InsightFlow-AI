# Screenshots

Captured from the running application with the NovaMart sample dataset loaded,
at 1440×900 (and 390×844 for the mobile set), at 2× for legibility when scaled
down. These are real captures, not mockups — every figure in them is one the
product actually produced from the included sample data, which matters in a
product whose whole argument is that its figures are traceable.

## Marketing (dark by design)

| File | What it shows |
| --- | --- |
| `landing.png` | The landing hero: the claim, the demo link, and the top of the product shot |
| `landing-full.png` | The whole landing page, top to bottom, at 1× |
| `section-features.png` | The product section — four features, each shown with a real capture |
| `section-how-it-works.png` | From a spreadsheet to a decision, in four steps |
| `section-evidence.png` | Why this is not an AI wrapper, with the answer pipeline |
| `section-security.png` | What the AI receives, and the certifications not claimed |
| `login.png` | Sign in |

## App — light

| File | What it shows |
| --- | --- |
| `onboarding.png` | First run, from a real signup |
| `upload.png` | Step one of the guided upload flow |
| `overview.png` | The dashboard: greeting, KPIs with sparklines, the trend, What changed, Needs attention, What drove it |
| `insights.png` | Findings banded by severity, with the top one given prominence |
| `anomalies.png` | Anomalies with deviation bars and dates |
| `investigation.png` | An anomaly investigation, stopped above its evidence list |
| `datasets.png` | Dataset list and status |
| `fields.png` | Review detected fields — what was inferred, and what the analysis can support |
| `ask-empty.png` | Ask InsightFlow, entry screen |
| `ask.png` | Ask InsightFlow, an answer: conclusion, evidence, hypothesis, follow-ups |
| `reports.png` | The report list |
| `report.png` | The printable business performance report |
| `settings.png` | Workspace, profile, and exactly what the AI layer receives |

## App — dark

| File | What it shows |
| --- | --- |
| `overview-dark.png` | The dashboard |
| `insights-dark.png` | Insights |
| `investigation-dark.png` | The same investigation, served from its cached explanation |
| `ask-dark.png` | The same answer as `ask.png`, re-themed in place |

## Mobile (390px)

| File | What it shows |
| --- | --- |
| `mobile-landing.png` | The landing hero on a phone |
| `mobile-overview.png` | The dashboard, laid out for a phone rather than compressed |
| `mobile-ask.png` | The same answer as `ask.png`, on a phone |
| `mobile-investigation.png` | An investigation on a phone |
| `mobile-navigation.png` | The navigation drawer |

## Recapturing them

Both servers must be running, and the demo enabled.

```bash
# Terminal 1
cd backend && uvicorn app.main:app --port 8000

# Terminal 2
cd frontend && npm run dev

# Terminal 3
cd frontend && node scripts/capture-screenshots.mjs
```

The script opens a demo workspace, waits for the analysis to finish, and writes
each capture to this directory. It uses the same Playwright browser the
end-to-end tests do, so it needs no extra dependency.

Three of the captures — the investigation's explanation, the Ask answer and the
generated report — wait on a model. Against a local model on a CPU that is
several minutes apiece, so the whole run takes fifteen to twenty minutes;
against a hosted provider it takes a few. The Ask answer lives only in the
page, so its dark and phone versions are taken from the same page rather than
by asking again.

A small local model's prose is often rejected by the guardrails, and the
capture then shows the engine's own wording, with a footer saying no model was
used. That is the product behaving correctly, not a failed capture.

Re-run it after any visual change that these images would otherwise
misrepresent.
