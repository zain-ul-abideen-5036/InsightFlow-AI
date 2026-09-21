# Screenshots

Captured from the running application with the NovaMart sample dataset loaded,
at 1440×900 (and 390×844 for the mobile set), at 2× for legibility when scaled
down. These are real captures, not mockups — every figure in them is one the
product actually produced from the included sample data, which matters in a
product whose whole argument is that its figures are traceable.

## Desktop

| File | What it shows |
| --- | --- |
| `landing.png` | The landing page: the claim, the product shot, and the trust argument |
| `login.png` | Sign in, with the evidence proposition on the panel beside it |
| `onboarding.png` | First run, from a real signup |
| `upload.png` | Step one of the guided upload flow |
| `overview.png` | The dashboard: greeting, KPIs with sparklines, the trend band, What changed, Needs attention |
| `overview-dark.png` | The same dashboard in dark theme |
| `insights.png` | Findings banded by severity, with the top one given prominence |
| `anomalies.png` | Anomalies with deviation bars and dates |
| `investigation.png` | An anomaly investigation, with possible explanations set apart from observations |
| `datasets.png` | Dataset list and status |
| `fields.png` | Review detected fields — what was inferred, and what the analysis can support |
| `ask-empty.png` | Ask InsightFlow, entry screen |
| `ask.png` | Ask InsightFlow, an answer: conclusion, evidence, hypothesis, follow-ups |
| `reports.png` | The report list |
| `report.png` | The printable business performance report |
| `settings.png` | Workspace, profile, and exactly what the AI layer receives |

## Mobile (390px)

| File | What it shows |
| --- | --- |
| `mobile-landing.png` | The landing hero and product shot on a phone |
| `mobile-overview.png` | The dashboard, laid out for a phone rather than compressed |
| `mobile-ask.png` | Ask InsightFlow on a phone |
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

Two of the captures — the Ask answer and the generated report — are each two
model calls. Against a local model on a CPU that is several minutes apiece, so
the whole run takes ten to fifteen minutes; against a hosted provider it takes
about one.

Re-run it after any visual change that these images would otherwise
misrepresent.
