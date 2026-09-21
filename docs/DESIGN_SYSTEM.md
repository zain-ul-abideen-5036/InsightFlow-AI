# Design system

The rules this interface is built from, and why each one exists. Most of them
are reactions to something that was actually wrong — those are recorded in
[UI_UX_AUDIT.md](UI_UX_AUDIT.md), and referenced here rather than repeated.

Tokens live in [`frontend/app/globals.css`](../frontend/app/globals.css) and
are exposed to Tailwind in
[`frontend/tailwind.config.ts`](../frontend/tailwind.config.ts). A component
never reaches past those two files for a colour, a size, a shadow or a
duration.

---

## 1. The three ideas

**Depth carries hierarchy.** The application canvas is a visibly tinted grey,
cards are white, and the chrome is its own surface. Before the redesign all
three were within one percent lightness of each other, so nothing advanced and
nothing receded and the eye had no entry point on any screen. Elevation is now
a real ladder and every step is perceptible.

**Colour means something or it is absent.** One blue accent, plus semantic
success, warning and danger. Nothing is coloured to be decorative. Every
semantic use is paired with an icon or a word, so colour is never the sole
signal (WCAG 1.4.1).

**Light is the primary theme.** Business analytics is read in offices, in
daylight, and printed. Dark is a first-class alternative, tuned separately
rather than derived by inversion.

---

## 2. Colour

### Surfaces

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--background` | `220 24% 97%` | `224 36% 6%` | The canvas everything sits on |
| `--chrome` | `220 28% 98.5%` | `224 32% 7.5%` | Sidebar and top bar |
| `--card` | `0 0% 100%` | `223 28% 10%` | Cards, panels, popovers' base |
| `--surface-raised` | `0 0% 100%` | `223 26% 12.5%` | A card inside a card |
| `--surface-sunken` | `220 24% 95.5%` | `224 38% 4.5%` | Wells, evidence strips, footers |
| `--inverse` | `222 42% 10%` | `220 20% 95%` | Sections that must carry weight |

The canvas being genuinely grey is what lets a white card read as a card
without a heavy shadow. That single change does more for the product's
perceived quality than any component in it.

`--inverse` flips with the theme, so an inverted band is dark on a light page
and light on a dark one — it is *contrast against the page*, not "the dark
one".

### Text

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--foreground` | `222 32% 10%` | `220 20% 95%` | Body and headings |
| `--muted-foreground` | `220 11% 38%` | `220 13% 68%` | Secondary prose, descriptions |
| `--subtle-foreground` | `220 10% 43%` | `220 12% 60%` | Metadata: timestamps, counts, periods |

Both muted values were raised during the redesign. The old
`--muted-foreground` at 44% lightness measured 4.62:1 against white but was
being used at 11px against the tinted canvas, where it fell under the
threshold; `--subtle-foreground` at 47% measured 4.38:1 and failed outright.

### Accent and semantics

`--primary` is one blue: `221 83% 50%` light, `217 91% 62%` dark. Each
semantic colour comes as a set of four — the colour, its foreground, a
`-subtle` fill and a `-border` — so a tinted callout never has to invent its
own border from an opacity.

Semantic colour is reserved for:

- **status** — analysis running, dataset ready, provider reachable
- **trend** — whether a movement is good news (see §7)
- **severity** — how much a finding deserves attention
- **destruction** — actions that cannot be undone

Not for: decoration, category, emphasis, or making a screen look busier.

### Charts

Six categorical series, ordered for maximum adjacent contrast and checked to
remain distinguishable in greyscale. `--chart-grid` and `--chart-axis` are
separate from `--border` and `--muted-foreground`: chart furniture wants to be
quieter than UI furniture, and borrowing UI tokens meant every grid line
changed whenever a border did.

### Contrast

Every foreground/background pair the product renders is above 4.5:1 in both
themes — the AA threshold for normal text. Nothing relies on the 3:1
large-text allowance, because the type that most needs the allowance (12px
metadata) is exactly the type that cannot have it.

| Pair | Light | Dark |
|---|---|---|
| foreground on background | 16.86 | 17.21 |
| muted-foreground on card | 6.61 | 7.74 |
| subtle-foreground on background | 5.06 | 6.45 |
| primary on card | 5.77 | 5.36 |
| success on success-subtle | 4.83 | 6.83 |
| warning on warning-subtle | 4.76 | 7.32 |
| danger on danger-subtle | 5.39 | 5.03 |

---

## 3. Typography

One family: **Inter**, with JetBrains Mono for calculations and column names.

Body sits at **15px**. It was 13–14px throughout, including on the marketing
site and the login page. A small scale does not read as information-dense to
someone seeing a product for the first time — it reads as unfinished, and it
left the one large element on each page stranded.

| Step | Size / line-height | Used for |
|---|---|---|
| `2xs` | 12 / 17 | Eyebrows, badges, dense metadata |
| `xs` | 13 / 19 | Secondary metadata, chart axes |
| `sm` | 14 / 22 | Dense UI, table cells, card body |
| `base` | 15 / 24 | **Body.** The default |
| `md` | 16 / 26 | Ledes, section descriptions |
| `lg` | 18 / 28 | Card titles, section headings |
| `xl` | 21 / 30 | Featured finding titles |
| `2xl` | 24 / 32 | Page titles |
| `3xl` | 30 / 37 | Large page titles, landing h2 |
| `4xl` | 36 / 42 | Ask entry heading |
| `5xl`–`7xl` | 44 / 56 / 68 | Marketing display only |

Tracking tightens as size grows, which is what stops large headings looking
loose. Below `base` there is no tracking adjustment, because at those sizes it
costs legibility.

### Figures are not headings

A KPI value is a graphic element, so it has its own steps —
`metric-sm` (22), `metric` (28), `metric-lg` (36) — with their own optical
tracking. Every figure carries `.tabular`, so columns of numbers align and a
value does not reflow as it ticks.

### The `eyebrow`

`text-2xs font-semibold uppercase tracking-[0.09em] text-subtle-foreground`.
One class, used for every small capitalised label in the product, because
there were four slightly different versions of it.

---

## 4. Space and radius

Spacing follows Tailwind's 4px scale. What matters is that the same decision
is not re-made per instance:

| Context | Value |
|---|---|
| Page padding | `px-4` → `sm:px-6` → `lg:px-7` |
| Between top-level page sections | `space-y-7` (forms, lists), `space-y-9` (dashboard) |
| Card padding | `p-5` (`p-4` compact) |
| Card header → content | `pb-3.5` |
| Grid gap, cards | `gap-3` |
| Grid gap, sections | `gap-5` |
| Form field spacing | `space-y-5`, label → input `space-y-1.5` |

Radius is a three-step scale off `--radius` (10px): `lg` for controls, `xl`
(14px) for cards, `2xl` (18px) for dialogs and showcase surfaces. Larger
things get larger corners; that relationship is what makes radius read as
deliberate rather than arbitrary.

---

## 5. Elevation

| Token | Used for |
|---|---|
| `shadow-e0` | Sits on the canvas but must not float — inputs, quiet strips |
| `shadow-e1` | **The default card.** |
| `shadow-e2` | Asks for attention: the primary chart, a hovered card |
| `shadow-e3` | As far as anything goes short of an overlay |
| `shadow-overlay` / `shadow-popover` | Dialogs, menus, toasts, tooltips |
| `shadow-showcase` | The marketing product shot, which must read as an object |

Each is two layers — a tight contact shadow and a soft ambient one — because a
single blurred layer reads as a glow. The old scale topped out below the
threshold of visibility, which is why nothing on any screen appeared to sit
above anything else.

---

## 6. Motion

Three durations and three curves, as tokens:

```
--duration-fast: 120ms   /* hover, press, colour  */
--duration-base: 180ms   /* enter, leave, popover */
--duration-slow: 280ms   /* section entry         */

--ease-out:    cubic-bezier(0.22, 1, 0.36, 1)      /* arriving    */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)      /* both ways   */
--ease-spring: cubic-bezier(0.34, 1.32, 0.64, 1)   /* rare, small */
```

Rules:

- **Nothing moves further than 8px.** Sections enter on a rise; dialogs lift
  slightly as they scale.
- **Nothing loops** except honest progress indicators.
- **Press is a scale, not a translate.** A 1px downward shift moves the label
  off the pixel grid and makes the text shimmer, which reads as a rendering
  glitch at the exact moment the user is looking hardest at it.
- **Everything is inside `prefers-reduced-motion`.** One global rule in
  `globals.css` reduces every animation and transition to 0.01ms.

---

## 7. Components

### Button

Variants: `default`, `inverse`, `secondary`, `outline`, `ghost`, `link`,
`danger`, `subtle`, plus `on-inverse` and `on-inverse-outline` for use inside
an inverted section. Sizes `xs` → `xl` plus three icon sizes.

`loading` swaps in a spinner and, with `loadingText`, keeps the width stable so
the layout does not jump at the moment the user is waiting on it.

### Card

`elevation`: `flat` · `raised` (default) · `prominent` · `sunken` · `none`.
`tone`: `default` · `inverse` · `accent` · `success` · `warning` · `danger`.
`interactive` adds hover lift and shadow.

Two axes rather than a pile of one-off classNames, so "how much does this
card want to come forward" and "what kind of thing is it" are answered
separately.

### Badge

Subtle fills by default. `sentence` capitalises API-sourced vocabulary, which
is how "critical" from the anomalies endpoint and "Critical" from the insights
list stopped being two different words on adjacent screens.

### Delta

The one place a signed change is rendered. Three rules it enforces:

1. Direction survives without colour — always an arrow, always a sign.
2. Colour reflects whether the movement is *good*, not whether it is up.
   Falling cost is green. `isFavourable()` owns that judgement and returns
   `null` where there is none to make, which renders neutral.
3. Under half a percent is flat: a horizontal arrow and no colour.

### Segmented

A radiogroup, not tabs — these select what is shown, they do not switch
panels. Arrow keys move and select in one step. Carries counts, so the shape
of a result set is visible before you narrow it. Scrolls horizontally rather
than wrapping when the options genuinely do not fit.

### Sparkline

A glyph, not a chart: no axes, no tooltip, `aria-hidden`, because the value and
change beside it already carry the information in text. Its job is to say
whether a movement was a step, a drift or a spike — which a percentage cannot.

### StagedProgress

For work that takes real time. The contract is what makes it usable:

- It **never reaches its final stage on its own.** The last step stays pending
  until the caller says the work finished.
- It shows **no percentage.** A percentage implies measurement, and nothing
  here is measured.
- The stage names are **the real steps, in the real order** the server runs
  them, so a user who reads them learns something true.
- After four seconds it shows **elapsed time**, which is the honest answer to
  "is this stuck?".

### EmptyState

No dashed borders. A dashed box reads as an unimplemented placeholder, and it
was on five screens. Solid recessed surface, an icon given enough weight to be
a graphic, a real heading, and an action. `description` is required, because
"No data" answers none of the three questions an empty screen must answer.

### ChartFrame

Wraps every chart and guarantees two things at one place rather than at every
call site: a text `summary` that is always in the accessibility tree, and a
real data table behind a toggle. An SVG chart is unreadable to assistive
technology however it is labelled; the table is the accessible equivalent, and
sighted users reach for it when they want exact values.

---

## 8. Brand

**The mark** is a quiet signal resolving into one bright point. The line is the
data — four moves, a dip and a recovery, drawn at half opacity because in this
product the data is the input, not the output. The point is the finding: the
single verified datum the product exists to produce. It is the only saturated
element, it is knocked out of the line rather than sitting on top of it, and it
is what the eye lands on at any size.

It is **two-tone and therefore cannot use `currentColor`.** The previous mark
tried, and rendered as a white square with invisible white contents on every
authenticated screen in dark mode. Container and glyph are separate
theme-aware tokens (`--logo-box`, `--logo-line`, `--logo-datum`), with explicit
`ink`, `paper` and `brand` tones for fixed surfaces.

**The wordmark** sets `InsightFlow` at 640 weight with −0.022em optical
tracking. `AI` is a suffix, not part of the name: lighter, quieter, separated
by a little more than a word space.

The geometry lives in `MARK_GEOMETRY` and is duplicated, necessarily, in
`app/icon.svg` and `scripts/generate-brand-assets.mjs`.
`tests/brand.test.tsx` fails if the three ever drift apart — the kind of bug
nobody notices until the favicon is a different logo from the product.

---

## 9. Vocabulary

One word per action. The product previously used `Analyze`, `Analyse`,
`Run Analysis`, `Start Analysis` and `Process Dataset` for overlapping things,
and mixed US and UK spelling in adjacent strings.

| Concept | The word |
|---|---|
| Marketing CTA | **Try InsightFlow** |
| Run the engine over a dataset | **Analyse your data** / **Run analysis** |
| Confirm the schema and start | **Confirm fields and analyse** |
| The question feature | **Ask InsightFlow** — everywhere it is named |
| Open the figures behind a claim | **View evidence** |
| Drill into a finding | **Investigate** |
| Add a file | **Upload data** / **Add data** |

Spelling is British throughout (`analyse`, `summarise`), matching the prose the
engine itself writes.

Severity is one closed set — Critical, High, Medium, Low, Info — capitalised by
the `Badge` component rather than by each call site.

---

## 10. Accessibility

Non-negotiable, and where the design lost an argument it lost it:

- **Colour is never the only signal.** Every change has an arrow and a sign;
  every severity has a word.
- **Focus is always visible.** One global `:focus-visible` ring with an offset,
  on every interactive element.
- **Interactive means a real element.** The KPI provenance trigger was a
  `<span role="button" tabIndex={0}>` with no key handler — focusable,
  announced as a button, impossible to operate. It is a `<button>`.
- **Overlays honour what they claim.** The mobile drawer declared
  `aria-modal="true"` and did nothing about it; it now traps Tab, locks body
  scroll, and restores focus to whatever opened it.
- **Charts have a text equivalent.** See `ChartFrame`.
- **Errors are announced.** Every `role="alert"` is mounted on the error, not
  present from first paint, so insertion triggers the announcement.
- **Motion is opt-out at the system level**, not only through our own toggles.

---

## 11. Adding something new

1. Is there a token for it? Use it. If not, ask whether the thing really needs
   a new value or whether it needs to look like something that already exists.
2. Is there a component for it? Extend it with a variant rather than forking
   it at the call site.
3. Does it need colour? Only if the colour carries status, trend, severity or
   destruction — and then pair it with a word or an icon.
4. Does it move? Use a duration and a curve token, keep it under 8px, and
   check it with reduced motion on.
5. Can you operate it with a keyboard, and does a screen reader get the same
   information the screen does?
