# @shepherd-creative/weave-adapter-skill

## 0.2.0

### Minor Changes

- 16e157a: New package: `weave-adapter-skill`. The `SKILL.md` that teaches an LLM to convert a brand's design source (a `DESIGN.md`, a design-token repository or a brand CSS file) into a validated Weave theme: a `weave-theme.css`, a composition-brief `DESIGN.md` and a `drop-report.json`. It is an offline authoring method, not a runtime dependency. The model authors a static theme by human-reviewed judgement, and `weave-theme lint --require-drop-report` gates it deterministically before it ships. Eight numbered steps encode the brand-iron dry-run learnings: structural mapping, one-accent tone derivation, chart-ramp synthesis, font fallback stacks and the v3 routing tokens, drop and gap recording, the composition brief and the lint gate. Ships `loadSkill()` / `skillPath()` for embedding the skill into an agent harness, and backfills `examples/themes/brand-iron/drop-report.json` as the worked example.

### Patch Changes

- bbfc278: Public-facing documentation pass ahead of the open-source release: reword shipped docs (README.md, SKILL.md) to drop em dashes and Oxford commas and tidy the copy. No code or behaviour change.
- 7a71e41: Relicense under MIT (LICENSE file at the repository root; all package licence fields flipped from UNLICENSED).
