---
name: weave-theme-adapter
description: >-
  Convert a brand's design source into a validated Weave theme. Use when
  adapting a brand to Weave, or when the user says "create a weave theme from
  my DESIGN.md", "adapt my brand", "brand my dashboards" or points at a
  design-token repository or brand CSS and wants Weave to render in that look.
  Produces a weave-theme.css, a composition-brief DESIGN.md and a
  drop-report.json, gated by the weave-theme lint CLI.
---

# Weave theme adapter

The full method lives in `packages/weave-adapter-skill/SKILL.md`, the single
source of truth for this workflow. Read it and follow its eight numbered steps
end to end. Do not reimplement the method here or from memory: the package
`SKILL.md` carries the token contract, the drop-report schema, the worked
brand-iron example and the exact lint gate, and it is the file that ships to any
other host or agent.
