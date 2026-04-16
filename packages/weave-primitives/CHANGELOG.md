# @shepherd-creative/weave-primitives

## 0.0.0 (unreleased — B3)

- Initial cut: 12 of 18 primitives.
  - Atoms: `Number`, `Label`, `Icon`.
  - Molecules: `KPI`, `Stat`, `DataRow`, `Chart`.
  - Organisms: `MetricBand`, `ChartCard`, `TableCard`, `NoteCard`.
  - Layouts: `Grid`, `Stack`.
- Zod schemas in `./schemas` — single source of truth shared with `@shepherd-creative/weave-mcp-server`.
- `<Weave spec={...} />` recursive dispatcher with spec validation.
- Recharts integration via `resolveCSSVar()` helper — charts inherit `--chart-N` from the host theme.
- Theme-neutral: every colour → CSS var, every size → semantic token.
- Sparkline prop accepted on KPI but not rendered (Sparkline atom lands in B5).
