# @shepherd-creative/weave-tokens

Default CSS variables for Weave primitives. **Opt-in**.

Most host apps won't import this file — they already have shadcn-style variables and only need to add the Weave-specific additions. This package is for apps that want sensible defaults out of the box.

## Install

```bash
pnpm add @shepherd-creative/weave-tokens
```

## Use

```css
@import "@shepherd-creative/weave-tokens/tokens.css";
```

Or in the host app's root layout:

```tsx
import "@shepherd-creative/weave-tokens/tokens.css";
```

## What this package defines

- **Structural** (shadcn-inherited): `--background`, `--foreground`, `--card`, `--card-foreground`, `--border`, `--muted`, `--muted-foreground`, `--primary`, `--primary-foreground`, `--destructive`, `--destructive-foreground`, `--radius`.
- **Semantic tones** (Weave additions): `--tone-positive`, `--tone-negative`, `--tone-warning`, `--tone-info`, each with a `-muted` variant.
- **Chart palette**: `--chart-1` through `--chart-8`.
- **Typography**: `--font-sans`, `--font-mono`, `--font-display`.

## Custom theming

Override any of the above in your own stylesheet after importing:

```css
@import "@shepherd-creative/weave-tokens/tokens.css";

:root {
  --tone-positive: #22c55e;
  --chart-1: #ec4899;
}
```

## Contract v2

Beyond the base palette, primitives read the `--weave-*` variables below for typography, spacing, surfaces and chart treatment. Every default equals the literal that used to be hard-coded in the components, so leaving them untouched is render-identical to pre-v2. The machine-readable list ships as `tokens.json` (`{ name, category }` per variable); it is what `weave-mcp-app` validates brand themes against.

"style.ts" in the consumed-by column is `weave-primitives`' shared sizing helpers (font-size, gap, density and label-role scales) used by Label, Number, KPI, Stat, Grid and Stack.

| Variable | Category | Default | Consumed by |
|---|---|---|---|
| `--weave-font-size-xs` | typography | `0.75rem` | style.ts, ChartCard, DataRow, KPI, Stat, TableCard |
| `--weave-font-size-sm` | typography | `0.875rem` | style.ts, ChartCard, DataRow, KPI, NoteCard, TableCard |
| `--weave-font-size-md` | typography | `1rem` | style.ts |
| `--weave-font-size-lg` | typography | `1.125rem` | style.ts |
| `--weave-font-size-xl` | typography | `1.25rem` | style.ts |
| `--weave-font-size-number-md` | typography | `1.5rem` | style.ts |
| `--weave-font-size-number-lg` | typography | `2.25rem` | style.ts |
| `--weave-font-size-number-xl` | typography | `clamp(1.75rem, 8cqi, 3.25rem)` | style.ts |
| `--weave-font-size-display` | typography | `clamp(1.5rem, 6cqi, 2.5rem)` | style.ts |
| `--weave-font-size-overline` | typography | `0.6875rem` | style.ts, TableCard |
| `--weave-font-size-code` | typography | `0.8125rem` | NoteCard |
| `--weave-font-weight-normal` | typography | `400` | style.ts |
| `--weave-font-weight-medium` | typography | `500` | style.ts, DataRow, KPI, Number, Stat, TableCard |
| `--weave-font-weight-semibold` | typography | `600` | style.ts, ChartCard, NoteCard, Stat, TableCard |
| `--weave-font-weight-bold` | typography | `700` | style.ts, KPI, Number |
| `--weave-line-height-tight` | typography | `1.1` | KPI, Label, Number |
| `--weave-line-height-snug` | typography | `1.2` | Stat |
| `--weave-line-height-normal` | typography | `1.4` | Label |
| `--weave-line-height-relaxed` | typography | `1.55` | NoteCard |
| `--weave-letter-spacing-tight` | typography | `-0.025em` | style.ts |
| `--weave-letter-spacing-wide` | typography | `0.03em` | KPI, Stat, TableCard |
| `--weave-letter-spacing-wider` | typography | `0.04em` | KPI |
| `--weave-letter-spacing-widest` | typography | `0.06em` | TableCard |
| `--weave-letter-spacing-overline` | typography | `0.08em` | style.ts |
| `--weave-space-3xs` | spacing | `0.125rem` | ChartCard, DataRow, Stat, TableCard |
| `--weave-space-2xs` | spacing | `0.25rem` | ChartCard, DataRow, KPI, NoteCard |
| `--weave-space-xs` | spacing | `0.375rem` | KPI, TableCard |
| `--weave-space-sm` | spacing | `0.5rem` | style.ts, DataRow, KPI, NoteCard, Stat, TableCard |
| `--weave-space-md` | spacing | `0.75rem` | ChartCard, DataRow, TableCard |
| `--weave-space-lg` | spacing | `1rem` | style.ts |
| `--weave-space-xl` | spacing | `1.5rem` | style.ts |
| `--weave-card-padding` | spacing | `1rem` | ChartCard, NoteCard, TableCard |
| `--weave-density-compact` | spacing | `0.5rem` | style.ts |
| `--weave-density-comfortable` | spacing | `1rem` | style.ts |
| `--weave-density-spacious` | spacing | `1.5rem` | style.ts |
| `--weave-card-border-width` | surface | `1px` | Chart, ChartCard, DataRow, MetricBand, NoteCard, TableCard |
| `--weave-card-shadow` | surface | `none` | ChartCard, MetricBand, NoteCard, TableCard |
| `--weave-radius-sm` | surface | `calc(var(--radius) - 0.25rem)` | reserved (defined, not yet consumed) |
| `--weave-radius-md` | surface | `var(--radius)` | ChartCard, DataRow, MetricBand, NoteCard, TableCard |
| `--weave-radius-lg` | surface | `calc(var(--radius) + 0.25rem)` | reserved (defined, not yet consumed) |
| `--weave-radius-code` | surface | `3px` | NoteCard |
| `--weave-chart-grid` | chart | `var(--border)` | Chart |
| `--weave-chart-axis` | chart | `var(--muted-foreground)` | Chart |
| `--weave-chart-label` | chart | `var(--muted-foreground)` | Chart |
| `--weave-chart-tooltip-bg` | chart | `var(--card)` | Chart |
| `--weave-chart-tooltip-fg` | chart | `var(--card-foreground)` | Chart |
| `--weave-chart-tooltip-radius` | chart | `6px` | Chart |
| `--weave-chart-grid-dasharray` | chart | `3 3` | Chart |
| `--weave-chart-stroke-width` | chart | `2` | Chart |

### Deliberately not tokenised

A few numeric values stay hard-coded because they are structural geometry, not brand surface: chart `fillOpacity` (0.22 series, 0.3 cursor), icon `strokeWidth` (1.75), pie cell-separator `strokeWidth` (2), bar corner `radius` arrays, `chartHeight` and `iconPixelSize` step values, the Grid (`240px`) and MetricBand (`180px`) `minmax()` breakpoints and NoteCard's `0.0625rem` inline-code hairline pad. The `no-orphan-literals` test in `weave-primitives` enforces that everything else goes through a `var(--weave-*, fallback)`.
