# terminal-dense — composition brief

Operator console, not marketing site. Every pixel earns its place.

- High density. Default to `density: "compact"` on every card that accepts it.
- Tables over charts. Reach for `TableCard` first; only chart when a trend
  genuinely needs a shape, and prefer bar or line, never pie or donut.
- Terse labels: clipped noun phrases ("req/s", "p99 ms", "errs"), no full
  sentences in titles or captions.
- Uppercase overlines: use `role: "overline"` labels to head sections.
- Pack the grid. Prefer more small KPIs over one hero number; `md` is the
  largest KPI size this brand uses.
- Tone colours are signals: `positive`/`warning`/`negative` map to states
  (ok/degraded/down), not to sentiment.
