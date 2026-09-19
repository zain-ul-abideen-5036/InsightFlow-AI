# Screenshots

Captured from the running application with the NovaMart sample dataset loaded,
at 1440×900, in light theme. These are real captures, not mockups — every figure
in them is one the product actually produced from the included sample data.

| File | What it shows |
| --- | --- |
| `landing.png` | The landing page: positioning, and the example answer |
| `overview.png` | The dashboard: KPI row, revenue trend with anomalies marked, ranked insights |
| `datasets.png` | Dataset list and upload |
| `fields.png` | Review detected fields — what was inferred, and what the analysis can support |
| `insights.png` | Ranked insight cards with their evidence |
| `investigation.png` | An anomaly investigation, with possible explanations set apart from observations |
| `ask.png` | Ask InsightFlow — an evidence-backed answer with its plan |
| `report.png` | The printable business performance report |

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
each capture to this directory. It uses the same Playwright browser the end-to-
end tests do, so it needs no extra dependency.

Re-run it after any visual change that these images would otherwise
misrepresent.
