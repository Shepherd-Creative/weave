# @shepherd-creative/weave-primitives

Theme-neutral React primitives for LLM-composed dashboards.

> **Status:** B3 pre-release. 12 primitives shipped. Not yet published to npm.

## What it does

You give it a JSON spec. It renders React components styled entirely through CSS custom properties — your theme is the source of truth.

```tsx
import { Weave } from "@shepherd-creative/weave-primitives";

<Weave
  document={{
    weave: 1,
    root: {
      type: "Stack",
      children: [
        {
          type: "KPI",
          label: "Revenue",
          value: 248500,
          format: "currency",
          currency: "USD",
          size: "xl",
          delta: { value: 0.142, format: "percent", tone: "positive" },
        },
      ],
    },
  }}
/>;
```

A document is `{ weave: 1, root }`. `root` is a layout (`Grid`, `Stack`) or a display organism (`MetricBand`, `ChartCard`, `TableCard`, `NoteCard`) — atoms and molecules compose inside a layout. Everything is validated once, by the same gate every transport uses: payload size, nesting depth, node count, bounded arrays and strings, finite numbers, one table cell per header, and document-wide unique `id`s.

The pre-Wave-1 `spec` prop still works and is deprecated; it routes through the exported `legacySpecToDocumentV1` adapter, which wraps a bare spec but never repairs one. See [docs/specs/weave-document-v1.md](../../docs/specs/weave-document-v1.md) for the contract, the measured limits and the migration guide.

## Primitives available in B3

| Category | Primitives |
|---|---|
| Atoms | `Number`, `Label`, `Icon` |
| Molecules | `KPI`, `Stat`, `Chart` |
| Organisms | `MetricBand`, `ChartCard`, `TableCard`, `NoteCard` |
| Layouts | `Grid`, `Stack` |

Table rows use a `DataRow` shape inside `TableCard.rows`. It is not a member of the node union: on its own it renders a `<tr>` with no table around it.

Planned next: `Sparkline`, `ProgressBar`, `Badge`.

Nothing else is committed. Whitespace and sectioning are owned by `Grid`/`Stack` gaps and density rather than by a dedicated primitive, and a two-value comparison composes today as a `Stack` of two `KPI`s.

## Install

```bash
pnpm add @shepherd-creative/weave-primitives react react-dom recharts lucide-react zod
```

`react`, `react-dom`, `recharts` and `lucide-react` are optional peers. If you only want the document contract — validating LLM output in a service, a worker or a CLI — the `/schemas` entry point resolves nothing but `zod`:

```bash
pnpm add @shepherd-creative/weave-primitives zod
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
import { validateWeaveDocument, KPISchema } from "@shepherd-creative/weave-primitives/schemas";
import { resolveCSSVar } from "@shepherd-creative/weave-primitives/utils";
```

## License

MIT. See [LICENSE](../../LICENSE) at the repository root.
