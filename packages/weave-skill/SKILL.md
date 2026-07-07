# DASHBOARD COMPOSITION — SKILL

> **Note to LLM:** This skill teaches you how to compose dashboards using `@shepherd-creative/weave-primitives` through the MCP server tools. You have no colour palette to pick. You have no typography scale to pick. You only pick **what to show, in what arrangement, with what semantic tone and size**. The host app's theme tokens supply every actual value at render time.

---

## 1. When to use this skill

Use this skill whenever the user asks for any of:

- A dashboard, summary, or overview of data.
- Metrics, KPIs, performance numbers, trends.
- Comparisons between two or more things (time periods, audiences, campaigns, variants).
- Charts, tables, or data visualisations.
- A "what's going on" view of recent activity.

Use this skill **only** for data-dense composition. For prose answers, free-form explanations, or conversational replies, respond in the chat channel, not through MCP tools.

---

## 2. The core contract

You do **not** emit colours. You do **not** emit pixel values. You do **not** write HTML or CSS. You **only** emit JSON specs that describe a tree of primitives. The library renders them using the host app's theme.

Every dashboard spec is a tree rooted in a **layout primitive** (`Grid` or `Stack`) containing organisms (`MetricBand`, `ChartCard`, `TableCard`, `NoteCard`).

---

## 3. Tone semantics

Six tones. Never invent new ones.

| Tone | Use when… |
|---|---|
| `default` | The number is informational, no semantic charge. Most values. |
| `muted` | Supporting context, secondary to the main story. Labels, captions. |
| `positive` | The value represents an improvement or good state, **from the user's point of view**. |
| `negative` | The value represents a regression or bad state, **from the user's point of view**. |
| `warning` | Attention needed, anomaly, threshold crossed. |
| `info` | Neutral highlight that deserves attention (new, updated, note). |

**Critical — semantic direction is yours to decide.**

> If "cost-per-click went up 12%", that's `negative`. The number going up does not mean `positive`.
> If "cancellations went down 8%", that's `positive`. The number going down does not mean `negative`.

The primitives trust your semantic judgement. Never set `tone="positive"` just because a delta is positive-signed.

---

## 4. Size semantics

Five sizes. Apply them as a hierarchy.

| Size | Use when… |
|---|---|
| `xl` | **The** headline KPI for the whole dashboard, rendered as a **standalone** `KPI` that occupies the full width of its row. Zero or one per screen. |
| `lg` | Secondary headline KPIs (typically the items in a `MetricBand`). **Max size allowed inside a `MetricBand`, `Grid`, or any multi-sibling container.** |
| `md` | Default. Stats inside tables, comparison values, regular numbers. |
| `sm` | Inline within sentences, dense table cells. |
| `xs` | Captions, fine print, overline labels. |

**Hierarchy dies with ties.** If you set two numbers to `xl`, the user can no longer tell which is the headline. Pick one.

**Never use `xl` inside a `MetricBand`, `Grid`, or any container with siblings.** `xl` is sized for a card that owns its full row — inside a band, the number will blow out of its cell. When emphasising one KPI among several in a `MetricBand`, keep all items at `lg` and put the emphasised one first.

---

## 5. Composition rules

### 5.1 Structure

A typical dashboard has **one to three of**:

1. A `MetricBand` at the top with 3–5 KPIs (the "at a glance" row).
2. A `Grid` of `ChartCard`s and/or `TableCard`s below (the detail).
3. A `NoteCard` at the bottom with commentary, if the data warrants it.

Don't lead with a chart. Always open with either a headline `KPI`, a `MetricBand`, or a `Label` that frames what follows.

### 5.2 Density

| Widget count | Use `density` = |
|---|---|
| 1–2 | `spacious` (hero layout) |
| 3–5 | `comfortable` (default) |
| 6+ | `compact` (data-dense view) |

Never emit a dashboard with 8+ widgets in `spacious` — it scrolls forever and communicates nothing.

### 5.3 MetricBand sizing

- 1 KPI alone → use a standalone `KPI` with `size: "xl"`, not a `MetricBand`.
- 2 KPIs → use a `Stack` with two `KPI`s sized `lg`, or a `Comparison`.
- 3–5 KPIs → use `MetricBand`, items sized `lg`.
- 6+ KPIs → break into a `Grid` of `Stat`s sized `md`.

**Inside a `MetricBand`, prefer `format: "compact"` for currency and counts.** Cells may be narrow (MetricBand wraps to 2×2 or 1×N when its container is tight), and compact values (`$848K`, `12.8K`) fit comfortably where long values (`$847,500.00`, `12,847`) do not. Percentages and small decimals (`3.5%`, `$2.84`) stay as-is — they're already short. When emphasising a single KPI inside a band, place it first and keep all items at `lg`.

### 5.4 Chart framing

Every `ChartCard` needs a clear title (what the chart shows) and, if helpful, a caption (what to take away). Charts without framing are guessing-games.

Good:
> title: "Monthly revenue"
> caption: "Up 14% QoQ despite Nov dip"

Bad:
> title: "Revenue"
> caption: (none)

### 5.5 Chart variant selection

| User intent | Use variant |
|---|---|
| Change over time | `line` or `area` |
| Ranking / comparison across categories (≤8) | `bar` |
| Ranking with long labels (≥6 categories) | `horizontal-bar` |
| Share of a whole (≤6 slices) | `pie` or `donut` |
| Running total, stacked over time | `area` |

Never use pie for >6 slices. Never use pie to compare magnitudes across categories — use bar.

### 5.6 Deltas and percentages

**Percent values are fractions of 1.** `format: "percent"` multiplies by 100 at render: `0.034` renders as `3.4%`, `0.142` as `14.2%`. Passing `3.4` for "3.4%" renders `340%` — the single most common composition mistake. This applies to every `value` paired with `format: "percent"`: KPI values, deltas, Stat deltas and DataRow delta cells.

When you emit a delta:
- Always set `showSign: true` in the format. `+12.3%`, `-4.1%`, never bare `12.3%`.
- Always set `tone` based on the **user's** interpretation (see §3), not the sign.
- A zero delta is `tone: "muted"`, not `positive`/`negative`.

### 5.7 Tables

- `TableCard` for ≤40 rows. Beyond that, suggest a filter in a `NoteCard` and show top 10–20 rows plus a "showing N of M" caption.
- **Keep tables to ≤7 columns.** If you need more, split into two `TableCard`s or replace with a `Grid` of `Stat`s. Wide tables scroll horizontally inside the card, but that's a fallback, not a design goal — readers can't parse a table they have to scroll.
- Give every header a tone (`default` unless a column is flagged semantic) and an `align` — numeric columns align `end`.
- For columns that are deltas, use cell `kind: "delta"` — not `number` with a sign.

### 5.8 When to use a NoteCard

Use `NoteCard` when:
- The data alone doesn't tell the story (explain the why).
- A caveat needs surfacing (data is partial, period is unusual).
- A next-action recommendation is warranted.

Don't use `NoteCard` to restate numbers that are already on screen. The dashboard is not a slide deck.

---

## 6. What NOT to do

- **Never** emit `color`, `background`, `fontFamily`, `padding`, `margin`, `width`, `height` as numeric or hex values. These are all host-theme responsibilities.
- **Never** invent a primitive name. If the catalogue below doesn't have what you need, compose from what exists.
- **Never** emit more than one `size: "xl"` Number per dashboard.
- **Never** use `size: "xl"` inside a `MetricBand`, `Grid`, or any container with siblings — it will overflow its cell. Max size in such containers is `lg`.
- **Never** emit a `TableCard` with more than 7 columns — split or restructure.
- **Never** stack two `ChartCard`s directly without at least a `Label` or another organism between them — charts need breathing room and framing.
- **Never** nest a layout primitive inside a card. Cards are leaf containers at the composition level.
- **Never** use `tone: "positive"` just because a number is bigger than the reference. Judge semantics first.
- **Never** pass markdown inside a table cell's `text` value. Use `NoteCard` for anything that needs rich text.
- **Never** emit more than 8 data series in a single chart. The eye can't track more.
- **Never** emit a chart with no title.

---

## 7. Worked examples

### 7.1 "Show me Q1 performance"

```json
{
  "type": "Stack",
  "gap": "md",
  "children": [
    {
      "type": "MetricBand",
      "items": [
        {
          "type": "KPI",
          "label": "Revenue",
          "value": 248500,
          "format": "currency",
          "currency": "USD",
          "size": "lg",
          "delta": { "value": 0.142, "format": "percent", "tone": "positive", "showSign": true }
        },
        {
          "type": "KPI",
          "label": "Conversion rate",
          "value": 0.034,
          "format": "percent",
          "precision": 1,
          "size": "lg",
          "delta": { "value": -0.003, "format": "percent", "tone": "negative", "showSign": true }
        },
        {
          "type": "KPI",
          "label": "Avg CPA",
          "value": 42.18,
          "format": "currency",
          "currency": "USD",
          "size": "lg",
          "delta": { "value": 0.06, "format": "percent", "tone": "negative", "showSign": true }
        }
      ]
    },
    {
      "type": "Grid",
      "cols": 2,
      "gap": "md",
      "children": [
        {
          "type": "ChartCard",
          "title": "Revenue by week",
          "caption": "Up 14% QoQ; dip week 9 tracked to holiday shift",
          "chart": {
            "type": "Chart",
            "variant": "line",
            "data": [
              { "week": "W1", "revenue": 48000 },
              { "week": "W2", "revenue": 52000 }
            ],
            "categoryKey": "week",
            "valueKeys": ["revenue"],
            "height": "md"
          }
        },
        {
          "type": "ChartCard",
          "title": "Spend by channel",
          "chart": {
            "type": "Chart",
            "variant": "horizontal-bar",
            "data": [
              { "channel": "Search", "spend": 82000 },
              { "channel": "Social", "spend": 71000 },
              { "channel": "Display", "spend": 39000 }
            ],
            "categoryKey": "channel",
            "valueKeys": ["spend"],
            "height": "md"
          }
        }
      ]
    }
  ]
}
```

### 7.2 "How does Campaign A compare to Campaign B?"

```json
{
  "type": "Stack",
  "gap": "md",
  "children": [
    {
      "type": "TableCard",
      "title": "Per-campaign breakdown",
      "headers": [
        { "text": "Campaign", "align": "start" },
        { "text": "Spend",    "align": "end" },
        { "text": "Revenue",  "align": "end" },
        { "text": "ROAS",     "align": "end" },
        { "text": "\u0394 WoW",    "align": "end" }
      ],
      "rows": [
        { "type": "DataRow", "cells": [
          { "kind": "text",   "value": "Campaign A" },
          { "kind": "number", "value": 34000, "format": "currency", "currency": "USD" },
          { "kind": "number", "value": 142000, "format": "currency", "currency": "USD" },
          { "kind": "number", "value": 4.18, "format": "decimal", "precision": 2 },
          { "kind": "delta",  "value": 0.08, "format": "percent", "tone": "positive" }
        ]},
        { "type": "DataRow", "cells": [
          { "kind": "text",   "value": "Campaign B" },
          { "kind": "number", "value": 29000, "format": "currency", "currency": "USD" },
          { "kind": "number", "value": 118000, "format": "currency", "currency": "USD" },
          { "kind": "number", "value": 4.07, "format": "decimal", "precision": 2 },
          { "kind": "delta",  "value": -0.02, "format": "percent", "tone": "negative" }
        ]}
      ]
    }
  ]
}
```

### 7.3 "Give me a one-line status"

```json
{
  "type": "KPI",
  "label": "Active campaigns",
  "value": 12,
  "size": "xl",
  "caption": "3 awaiting approval",
  "icon": "target"
}
```

Not every dashboard needs a grid. A single `KPI` is sometimes the best answer.

---

## 8. Self-check before emitting

Before returning your spec, verify:

1. Every `tone` is one of the six canonical values.
2. Every `size` is one of the five canonical values.
3. At most one `Number` / `KPI` has `size: "xl"`, **and** that `xl` is on a standalone `KPI`, not inside a `MetricBand` or `Grid`.
4. Every `TableCard` has ≤7 columns.
5. Every `ChartCard` has a non-empty `title`.
6. Every delta's `tone` reflects user-point-of-view semantics, not signed-value direction.
7. No hex colours, pixel values, or font names anywhere in the spec.
8. No primitive type outside the catalogue.
9. The top-level is a layout primitive (`Grid`, `Stack`) or a single organism — never a raw atom as root.

---

## 9. Catalogue reference

Primitives available in B3:

- **Atoms:** `Number`, `Label`, `Icon`
- **Molecules:** `KPI`, `Stat`, `DataRow`, `Chart`
- **Organisms:** `MetricBand`, `ChartCard`, `TableCard`, `NoteCard`
- **Layouts:** `Grid`, `Stack`

Primitives planned for B5 (not yet available): `Sparkline`, `ProgressBar`, `Badge`, `Divider`, `Comparison`.

For exact prop shapes and icon names, refer to the Zod schemas exposed by `@shepherd-creative/weave-primitives/schemas` and the MCP tool descriptors at `GET /tools`.

---

# END OF SKILL CONTENT
