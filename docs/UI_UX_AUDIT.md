# UI/UX audit

A walk through every screen of the running application at 1440px, 768px and
390px, in both themes, against the question a stranger asks in the first two
seconds: *does this look like something a business would pay for?*

The verdict going in was that it does not — not because anything is broken, but
because the whole product is rendered in one visual register. This document
records what was actually wrong, screen by screen, before any of it was changed.

Captured from a live demo workspace (14,261 NovaMart orders, real analysis
output). Before/after images are in [`screenshots/`](screenshots/).

---

## The five problems underneath all the others

Nearly every individual complaint below is a symptom of one of these.

### P1 — One surface, repeated forever

`rounded-lg border border-border bg-card shadow-xs` is the only container in the
product. The KPI row, the chart frame, an insight, an anomaly, a settings panel,
a landing-page feature tile and a FAQ entry are all the same white rectangle
with the same 1px grey border and the same near-invisible shadow, on a
background (`--surface`, 99% lightness) that is almost the same white.

The result is a page with no foreground and no background. Nothing recedes and
nothing advances, so the eye has no entry point and everything competes equally.
This single fact is most of why the product reads as a template.

**Severity: critical.** Affects every screen.

### P2 — The type scale is set for density, not for confidence

`base` is 0.875rem and `sm` is 0.8125rem. Body copy across the application is
13px, section headings are 15px, and labels are 11px uppercase. It is a scale
built for a dense internal admin tool, and it is applied unchanged to a
marketing hero and to a login page.

Small type does not read as "information-dense" to a first-time visitor. It
reads as unfinished, and it makes the one genuinely large thing on each page —
the h1 — look stranded.

**Severity: critical.** Affects every screen.

### P3 — Colour carries alarm, not meaning

Fourteen insights on `/insights` render as fourteen cards with a coloured left
border, a coloured icon chip, and a severity badge. Eleven of them are red. On
the dashboard the first four "Key insights" are all `Critical` red.

When everything is critical, nothing is. Worse, a business owner's first
impression of their own data becomes a wall of red — which is both inaccurate
(revenue rose over the full period) and unpleasant.

**Severity: high.** `/overview`, `/insights`, `/anomalies`.

### P4 — Layout is driven by the grid, not by the content

Cards are placed in CSS grids and then stretched to match their tallest
sibling. On the dashboard this leaves roughly 380px of empty white beneath the
trend chart, because the chart card is in a `xl:col-span-3` next to a taller
insights column. It is the largest single visual defect in the product and it
is on the most important screen.

The same mechanism cramps the contribution and breakdown charts, whose category
labels wrap to two lines inside a fixed gutter.

**Severity: critical.** `/overview`.

### P5 — Mobile is the desktop layout, narrower

Every responsive breakpoint reflows the same components. At 390px the
contribution chart's bars are sub-pixel, the breakdown chart's bars are ~2px
wide against 120px of wrapped labels, the KPI grid leaves an orphan fifth card
in a 2-up grid, and the dashboard is 8,480px tall.

**Severity: high.** All application screens at ≤768px.

---

## Screen by screen

### Landing page — `/`

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| L1 | Eight consecutive sections use the identical rhythm: `border-b border-border py-20`, a centred h2, a centred lede, then a 3-column grid of bordered cards. | The page has no pacing. A reader scrolling cannot tell where they are or which section matters, so they stop reading around section three. | Vary section treatment deliberately: inverted dark section for the trust argument, full-bleed product shot, asymmetric two-column for evidence, bordered list for FAQ. Give each section a distinct silhouette. | **High** |
| L2 | The hero is 780px tall to hold a badge, an h1, one paragraph, two buttons and a caption, then the product preview begins below the fold. | The single most persuasive asset on the page — a picture of the product working — is invisible until the visitor scrolls. | Tighten hero vertical rhythm, raise the preview so it breaks the fold, and give it real presence (larger, angled light, contained shadow). | **High** |
| L3 | `grid-backdrop` renders at `border/0.55` on a white background and is essentially invisible; it costs a paint and buys nothing. | Decoration that cannot be seen is not restraint, it is waste. | Replace with a purposeful hero treatment: a tinted surface, a defined edge, and a real radial accent behind the product shot. | Medium |
| L4 | The `DashboardPreview` is a hand-built static mock with CSS-div bars. Its figures are real but it does not resemble the actual dashboard — different KPI set, no real chart, different insight formatting. | It promises a product that the visitor does not then find. | Rebuild the preview from the same visual language as the redesigned dashboard: real SVG trend line, real KPI cards with sparklines, real insight rows. | **High** |
| L5 | Nav is `How it works / Features / Use cases / Security / FAQ` — five anchors, no grouping, no indication of what the product *is*. | Reads as a table of contents rather than a product menu. | Reduce to Product / How it works / Features / Security, matching the brief, with `Try InsightFlow` as the primary CTA. | Medium |
| L6 | Primary CTA label is `Analyze your data` in the hero but `Get started` in the header and `Analyze your data` again at the foot. | Three labels for one action. | One vocabulary (see UX1). | Medium |
| L7 | The evidence section — the product's actual differentiator — is a two-column block visually identical to every other section. | The strongest argument is given the least emphasis. | Promote to a full-width inverted section with the philosophy as a display statement and the four guarantees as a structured row. | **High** |

### Login / signup / reset — `/login`, `/signup`, `/reset-password`

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| A1 | A 400px form floats in the centre of a 1440px white page. Below the fold is ~300px of nothing. | This is the single most recognisable "student project" layout on the web. It is also the first authenticated impression. | Two-panel layout: form on the left at a comfortable measure, a product-argument panel on the right (inverted surface, the evidence proposition, a real figure). Collapses to a single column under 1024px. | **High** |
| A2 | No product context at all beyond the logo — no tagline, no reason to continue. | A visitor who arrived from a link has nothing to orient them. | The right panel carries the tagline and one concrete proof point. | Medium |
| A3 | The heading is `Welcome back` at `text-3xl` with a 13px sub-line; the fields are 13px. | Reads as a form, not as a front door. | Larger heading, 15px labels and inputs, more generous field spacing. | Medium |

### Application shell

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| S1 | The sidebar's six primary items mix three different concerns — Overview/Insights/Anomalies/Ask are analysis, Datasets is data, Reports is output — under no heading, while a `WORKSPACE` heading sits above a single item (Settings). | The one piece of grouping present is the least useful one. | Group as Workspace (Overview, Insights, Anomalies, Ask, Reports) · Data (Datasets) · Account (Settings), per the brief. | **High** |
| S2 | The top bar is 56px tall and contains only the workspace name as static text, plus a theme toggle. | A full-width bar spent on a label that is already in the sidebar user menu. | Make it earn its place: workspace switcher, breadcrumb/page context, global actions, user menu. | **High** |
| S3 | Active nav state is `bg-accent` — a 4% grey wash — with no other marker. | At a glance it is hard to tell which page you are on. | Accent rail + tinted surface + weight change. | Medium |
| S4 | The sidebar is `bg-background` (pure white) and the content area is `bg-surface` (99% white). The 1% difference is not perceptible. | The shell does not read as a shell. | Give the sidebar a genuinely distinct, slightly recessed surface and a defined edge. | **High** |
| S5 | No breadcrumbs anywhere, including three levels deep at `/anomalies/[id]`. | No way back except the browser button. | Breadcrumb in the top bar for nested routes. | Medium |
| S6 | Mobile drawer animates in with `animate-slide-up` (a vertical translate) while sliding in from the left. | The motion contradicts the geometry. | Directional slide-in with a matching backdrop fade. | Low |

### Dashboard — `/overview`

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| D1 | ~380px of empty white below the trend chart, caused by grid row stretching. | The most important screen has a large visible hole in it. It looks broken, because it is. | Decouple the chart from the insights column; let the chart own a full-width band sized to its own content. | **Critical** |
| D2 | The `Key insights` panel is populated by anomalies (`Unusual units sold on 2026-03-14`), and the `Recent anomalies` card lower on the same page shows the same records again in a different format. | The same four findings are presented twice, under two names, in two visual treatments. It reads as a product that does not know what its own concepts mean. | Split the two properly: **What changed** (movements, contributions, trends) at the top; **Needs attention** (anomalies) as a separate, visually distinct band. Never the same record in both. | **Critical** |
| D3 | The page opens with `Overview` — a navigation label, not a statement. | The brief's `Good morning / Here's what changed in your business` framing is missing entirely. The screen does not greet, orient, or lead. | Time-aware greeting, the headline finding as the subject of the page, and the dataset/period context as metadata. | **High** |
| D4 | No date, period or metric control anywhere on the screen. | A business owner cannot ask "what about last quarter?" — the defining question of a dashboard. | Period context control in the header; metric switcher on the main trend chart (Revenue / Orders / Customers / AOV). | **High** |
| D5 | KPI cards show label, value and change, in a flat white box. No sparkline, no comparison bar, no sense of the shape behind the number. | Five numbers with no context is a table, not a dashboard. | Add a sparkline per metric, make the change pill a real pill, and raise the value's typographic weight. | **High** |
| D6 | Five KPI cards in a `lg:grid-cols-4 xl:grid-cols-5` grid; at 1280px the fifth wraps alone onto a second row. | Visible raggedness at a very common laptop width. | Four primary metrics as the brief specifies (Revenue, Orders, Customers, AOV), with profit/margin demoted to a secondary strip. | **High** |
| D7 | `Questions this data can answer` is a bare `flex-wrap` of outline buttons in a plain card at the very bottom. | The product's signature feature gets the weakest possible presentation, below the fold, styled as a form control. | Replace with the brief's closing CTA band: *Have a question about your business?* → `Ask InsightFlow`, with the suggested questions as real affordances. | **High** |
| D8 | Contribution chart category labels wrap to two lines (`Cirrus Office / Chair`) inside a cramped gutter; bars begin at the panel edge. | Unreadable at a glance, and the wrapping makes the row heights uneven. | Widen the label gutter, truncate with a tooltip at a sensible measure, add left padding. | Medium |
| D9 | Insight cards inside the dashboard column each carry a full `View evidence (2)` button, a severity badge, a coloured rail and an icon chip. | Four heavy cards in a narrow column; the buttons dominate the findings. | Compact variant: rail, statement, figure, and a quiet evidence affordance. Actions (`View evidence`, `Investigate`) appear on the row, not as stacked buttons. | Medium |

### Insights — `/insights`

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| I1 | Fourteen cards, all the same dimensions, all the same internal layout, in a 2-column grid. Severity is signalled only by a small badge and a 3px rail. | The ranking the page claims ("ranked by how much it matters") is invisible. Everything looks equally important. | Give the top finding real prominence; group the rest under severity headings; compact the tail. | **High** |
| I2 | Filters are two bare `Select`s labelled `Severity` and `Type` above the grid. | Reads as an admin table toolbar. | Segmented filter chips showing counts, so the shape of the results is visible before filtering. | Medium |
| I3 | Card body repeats the figure twice — once in prose (`Revenue was USD 10,306, 95.6% above the expected USD 5,269`) and once as a figure row (`$10.3K ↗ +95.6% from $5,269`). | Redundant, and the duplication makes each card taller than it needs to be. | Keep the prose statement; render the figure row as the compact evidence strip only where it adds the comparison. | Medium |

### Anomalies — `/anomalies`

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| N1 | Rows are a flat list with a small arrow glyph, prose, and an `Investigate` button pinned right. No sense of magnitude or time. | An anomaly list should show *when* and *how far out*. | Add a deviation bar and a date column; group by period. | Medium |
| N2 | Severity badge renders lowercase (`critical`) while insight badges render title case (`Critical`). | Inconsistent capitalisation of the same vocabulary on adjacent screens. | One badge component, one casing rule. | Medium |

### Ask InsightFlow — `/ask`

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| Q1 | The empty state is a 260px dashed-border box containing a small icon and two lines of centred grey text, with the suggested questions in a separate wrapped row *below* it, and the composer below that. | Three disconnected blocks. The dashed box in particular reads as an unimplemented placeholder — it is the most damaging single element in the application. | Rebuild as the brief specifies: a composed entry screen with the question as the hero, the composer immediately beneath it, and the example questions as a structured, clickable list — one coherent object. | **Critical** |
| Q2 | The answer renders as one undifferentiated card: headline, then `WHAT THE DATA SHOWS` in 11px grey caps, then a bordered explanations box, then `WHAT TO CHECK NEXT`. | The brief's four-part structure (Answer / Evidence / What changed / Possible explanation) exists in the data but is not legible in the design. Observations and hypotheses are distinguished only by a thin border. | Give the conclusion display weight; give evidence its own visible section with the figures as data, not prose; keep the hypothesis block visually and semantically separate. | **High** |
| Q3 | `Investigate further` does not exist. There is a prose list of things to check, but no clickable follow-ups. | The brief's defining interaction for this screen — *Break this down by product / Compare with previous period* — is absent. | Add follow-up question chips generated from the answer's plan and dimensions. | **High** |
| Q4 | While waiting, the user sees a spinner and `Analysing your data` — a single static line — for up to five minutes on a local model. | The brief is explicit that this is unacceptable, and it is the longest wait in the product. | Staged progress: *Understanding your question → Finding relevant data → Calculating metrics → Generating explanation → Preparing evidence*, advancing on real request milestones and never claiming completion it has not observed. | **Critical** |
| Q5 | The transcript uses a blue right-aligned bubble for the question — a chat convention — while the file header comment explicitly says this must not look like a chat product. | The design contradicts its own stated intent. | Render the question as a quoted prompt heading above its answer, not as a message bubble. | Medium |
| Q6 | The composer is `sticky bottom-0` over a `bg-surface` that matches the page, so it has no edge and appears to float mid-page with content visible beneath it. | Looks like a rendering fault when scrolled. | Give the docked composer a real surface, a top edge and a shadow. | Medium |

### Dataset upload — `/datasets/new`

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| U1 | The four-step indicator is four small numbered circles joined by 1px lines, 16px tall in a 900px-wide container. | The guided flow the brief asks for is present in logic but invisible in design. | A real stepper: current step named and described, completed steps marked, remaining steps legible. | **High** |
| U2 | The dropzone is a dashed rectangle with a small icon; below it a single sample-data row; below that ~400px of empty page. | Step 1 of the product's core flow is mostly empty space. | Tighten to the content, and fill the space with what the user needs to know: what a good file looks like, what will be detected, what happens next. | **High** |
| U3 | Validation (step 3) presents detected fields in a table for correction, but never states plainly that the file passed. | The brief asks for explicit `✓ Dataset readable / Required fields understood / …` reassurance. It is missing. | A validation summary panel above the field table. | Medium |
| U4 | Analysis progress is a list of stage names with a spinner on the active one. | Closest to right of any loading state in the product, but visually flat. | Keep the honest staging; raise the presentation. | Low |

### Reports — `/reports`, `/reports/[id]`

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| R1 | A generated report renders as a long single-column stack of the same white cards used everywhere else. | A report is the artefact a user sends to their board. It should look like a document, not like an app screen. | Document treatment: title block, measured column, sectioned typography, print styles. | Medium |
| R2 | Generation shows a spinner with no staging, and can take minutes on a local model. | Same problem as Q4. | Share the staged progress component. | **High** |

### Settings — `/settings`

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| E1 | Five unrelated panels stacked in one column: workspace, appearance, AI provider, data handling, danger zone. | No hierarchy; the destructive action sits in the same visual weight as the theme toggle. | Section the page, and give the destructive zone a genuinely distinct treatment. | Medium |

### Empty, loading and error states

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| X1 | `EmptyState` renders a dashed border box with a grey circle icon. Used on the dashboard, Ask, insights, anomalies and reports. | The dashed box is the single strongest "unfinished" signal in the product, and it appears on five screens. | Replace the dashed border with a composed, solid empty state: illustration-weight icon treatment, a real heading, a clear action. | **Critical** |
| X2 | Route-level `loading.tsx` renders a generic centred spinner. | The brief forbids exactly this. | Skeletons that match the shape of the screen being loaded. | **High** |
| X3 | Error states render `error.message` directly in several places. | Risks exposing internal text; gives the user nothing to do. | The three-part contract: what happened, why where known, what to do next. Already correct in `lib/fetch-errors.ts` — apply it consistently. | Medium |

### Brand

| # | Problem | Why it hurts | Fix | Priority |
|---|---|---|---|---|
| B1 | **The logo is broken in dark mode.** `LogoMark` fills the container `rect` with `currentColor` and draws the bars in hard-coded `white`. In the sidebar, `currentColor` resolves to `--foreground`, which in dark mode is near-white — so the mark renders as a white square with invisible white content. | The brand mark is illegible on every authenticated screen in dark mode. | Two-tone token system: container and glyph as separate, theme-aware values. | **Critical** |
| B2 | The mark itself — three ascending bars crossed by a wave, in a rounded square — is the most common analytics logo there is. It carries no idea specific to this product. | Forgettable, and indistinguishable from any template dashboard. | A mark that encodes the product's actual thesis: a signal resolving into a single verified point. | **High** |
| B3 | The wordmark is `font-semibold tracking-tight` at the default font with ` AI` appended in `font-normal text-muted-foreground`. No optical spacing, no considered relationship to the mark. | Reads as a `<span>`, not as a wordmark. | Tuned wordmark: optical sizing, deliberate tracking, considered treatment of the `AI` suffix, correct baseline alignment against the mark. | Medium |
| B4 | `app/icon.svg` hard-codes `#111827`, so the favicon is a near-black square on a dark browser chrome. | Invisible in dark browser UI. | Favicon on a brand surface, not on ink. | Medium |

### Consistency (whole product)

| # | Problem | Fix | Priority |
|---|---|---|---|
| UX1 | The same action is called `Analyze your data`, `Get started`, `Analyse`, `Run analysis`, `Confirm fields and analyse`, and `Review and analyse`. The product also mixes `Analyze` (US) and `Analyse` (UK) in adjacent strings. | One vocabulary, one spelling. `Analyse` throughout; `Try InsightFlow` for the marketing CTA; `Run analysis` for the in-product action. | **High** |
| UX2 | Severity vocabulary renders as `Critical` on insights and `critical` on anomalies. | One casing rule, applied by the component. | Medium |
| UX3 | `Ask a question` (dashboard button), `Ask InsightFlow` (nav), `Ask` (submit button), `What would you like to know?` (empty state) all name the same feature. | `Ask InsightFlow` everywhere the feature is named. | Medium |
| UX4 | Card padding is `p-6` on the landing page, `p-5` in `CardHeader`, `p-4` on KPI cards, `p-3.5` in the preview, `px-4 py-3.5` on answers. | One spacing scale, applied by component size, not per-instance. | Medium |

### Accessibility

| # | Problem | Fix | Priority |
|---|---|---|---|
| Y1 | The KPI tooltip trigger is a `<span role="button" tabIndex={0}>` with no key handler — focusable and announced as a button, but not operable by keyboard. | A real `<button>`. | **High** |
| Y2 | `--muted-foreground` at `220 9% 44%` on `--surface` gives 4.62:1 — passes AA for body text, fails the 4.5:1 target once used at 11px for metadata, which is most of its usage. | Darken to ≥4.9:1 and stop using it below 12px. | **High** |
| Y3 | The mobile drawer sets `role="dialog" aria-modal="true"` but does not trap focus or restore it on close. | Focus trap and restore. | **High** |
| Y4 | Charts expose no text alternative; `ChartFrame` has a `Data` toggle but the SVG itself is not described. | `role="img"` with a generated summary, plus the existing data table as the accessible fallback. | Medium |
| Y5 | Errors render into a `role="alert"` container that is present from first paint in some views, so the announcement may not fire. | Mount the alert on error, or use `aria-live` on a persistent region. | Medium |

### Performance

| # | Problem | Fix | Priority |
|---|---|---|---|
| F1 | `overview/page.tsx` server-renders, then `OverviewDashboard` immediately refetches the same payload client-side via `useQuery` with `initialData`. | Harmless (initialData suppresses the fetch) but `refetchInterval` polls every 2s whenever an analysis is running, including when the tab is hidden. Add `refetchIntervalInBackground: false`. | Medium |
| F2 | Recharts is imported into the dashboard, insights, investigation and report bundles. | It is already client-only; confirm it is not pulled into the marketing route group. | Low |
| F3 | Two Google fonts (Inter + JetBrains Mono) are loaded on the marketing route where the mono face is never used. | Scope the mono face to the application routes. | Low |

---

## What is already right, and must survive

Worth stating explicitly, because a redesign is a good opportunity to destroy
things that were correct:

- **The copy.** The landing page, the FAQ, the honest "we hold no SOC 2"
  disclosure, the `Possible explanation` hedging, the `Unavailable` component
  that states *why* a metric could not be computed. This writing is the best
  thing about the product and none of it should be softened for visual reasons.
- **The evidence model.** Every figure carries its provenance and the UI exposes
  it. The redesign must make this *more* visible, not less.
- **`isFavourable()`** — colouring a change by whether it is good news rather
  than by its sign. Falling cost is green. Keep it.
- **Honest progress.** `AnalysisProgress` and `DemoLauncher` both refuse to show
  invented percentages. Keep that principle while improving the presentation.
- **Direction is never colour-only.** Arrows accompany every change figure.
- **The analysis engine, API surface and guardrails.** Out of scope here.

---

## Order of work

1. Design system — tokens, type scale, elevation, motion. Everything else
   depends on it. *(P1, P2)*
2. Brand — mark, wordmark, favicon, OG image. *(B1–B4)*
3. Shell — sidebar grouping, top bar, breadcrumbs. *(S1–S6)*
4. Dashboard — the hole, the duplication, the hierarchy. *(D1–D9)*
5. Ask InsightFlow — empty state, answer structure, follow-ups, progress.
   *(Q1–Q6)*
6. Landing page — pacing, hero, preview, evidence section. *(L1–L7)*
7. Auth, upload, insights, anomalies, reports, settings.
8. States, responsive, accessibility. *(X, Y, P5)*
