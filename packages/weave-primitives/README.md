# @shepherd-creative/weave-primitives

Theme-neutral React primitives for LLM-composed dashboards.

> **Status:** B3 pre-release. 12 of 18 primitives shipped. Not yet published to npm.

## What it does

You give it a JSON spec. It renders React components styled entirely through CSS custom properties — your theme is the source of truth.

```tsx
import { Weave } from "@shepherd-creative/weave-primitives";

<Weave
  spec={{
    type: "KPI",
    label: "Revenue",
    value: 248500,
    format: "currency",
    currency: "USD",
    size: "xl",
    delta: { value: 0.142, format: "percent", tone: "positive" },
  }}
/>;
```

## Primitives available in B3

| Category | Primitives |
|---|---|
| Atoms | `Number`, `Label`, `Icon` |
| Molecules | `KPI`, `Stat`, `DataRow`, `Chart` |
| Organisms | `MetricBand`, `ChartCard`, `TableCard`, `NoteCard` |
| Layouts | `Grid`, `Stack` |

Deferred to B5: `Sparkline`, `ProgressBar`, `Badge`, `Divider`, `Comparison`.

## Install

```bash
pnpm add @shepherd-creative/weave-primitives react react-dom recharts lucide-react zod
```

## CSS variables you must define

Weave reads structural, semantic tone, and chart palette variables from the host app. See `@shepherd-creative/weave-tokens` for sensible defaults.

- Structural: `--background`, `--foreground`, `--card`, `--card-foreground`, `--border`, `--muted`, `--muted-foreground`, `--primary`, `--primary-foreground`, `--destructive`, `--destructive-foreground`, `--radius`
- Tones: `--tone-positive`, `--tone-negative`, `--tone-warning`, `--tone-info` (+ `-muted` variants)
- Chart: `--chart-1` through `--chart-8`
- Typography: `--font-sans`, `--font-mono`, `--font-display`

## Sub-path exports

```ts
import { Weave } from "@shepherd-creative/weave-primitives";
import { KPISchema, SpecSchema } from "@shepherd-creative/weave-primitives/schemas";
import { resolveCSSVar } from "@shepherd-creative/weave-primitives/utils";
```

## License

MIT. See [LICENSE](../../LICENSE) at the repository root.
