---
"@shepherd-creative/weave-tokens": minor
---

New `./validate` export: the deterministic theme-CSS validator (`validateThemeCss`, `ThemeValidation`, `THEME_CSS_MAX_BYTES`, `GUIDANCE_MAX_BYTES`, `knownVarsFromManifest`) moves from `weave-mcp-app` into `weave-tokens`, so the contract package validates its own contract and other consumers (e.g. a lint CLI) can share the single implementation.
