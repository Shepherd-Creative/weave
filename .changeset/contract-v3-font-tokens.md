---
"@shepherd-creative/weave-tokens": minor
"@shepherd-creative/weave-primitives": minor
---

Contract v3: per-role font routing and numeric font features. `weave-tokens` adds `--weave-font-overline`, `--weave-font-numeric` and `--weave-font-feature-numeric` (defaults identical to the `--font-sans`/`--font-display`/`normal` literals they replace); `weave-primitives` routes Label, KPI, TableCard, Number, Stat and DataRow through the new variables, keeping the existing `font-variant-numeric: tabular-nums` baseline in place.
