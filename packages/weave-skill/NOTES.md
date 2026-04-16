# SKILL — design notes (not shipped to the LLM)

These sections are context for Pierre / maintainers. Everything here is §10+ of the original [`dashboard-composition-skill.md`](../../../ad-agency-ai-assistant-V2/docs/plans/dashboard-composition-skill.md) design doc and is NOT part of the LLM-facing skill content.

---

## 10.1 SKILL.md loading decision — Q3

**Decision:** bake into the system prompt for B3 / A4. Revisit runtime loading when we migrate to Deep Agents.

Reasoning:
- Stock `BuiltInAgent` (used by our v2 upgrade) doesn't have a first-class skill-loading mechanism. Claude Code / Agent SDK do, but the CopilotKit runtime doesn't expose that surface today.
- Baking the skill content into the system prompt is a single source of truth that any agent runtime can consume. The skill file lives in `packages/weave-skill/SKILL.md`, and the CopilotKit runtime stringifies it into the system prompt on each request.
- This forces the skill to stay within a system-prompt budget (~1500–2000 tokens). The B3 draft is ~1200 tokens of skill content (§1–§9). Workable.
- Runtime loading (via progressive disclosure) is better for maintenance but adds a framework dependency for marginal gain at this stage.
- Switch trigger: skill grows beyond ~3k tokens, or we migrate to Deep Agents / Agent SDK natively for other reasons.

Implementation note for A4: extend `frontend/app/api/copilotkit/[[...slug]]/route.ts` to read `packages/weave-skill/SKILL.md` at server start and concat it into the system prompt alongside the ad-agency system prompt. Cache the read — file changes require a restart.

## 10.2 Testing plan

Validate the skill against the 10 canonical user asks inferred from the current app:

1. "Show me last month's performance."
2. "How are we doing this quarter?"
3. "Compare Campaign A vs Campaign B."
4. "What's our conversion rate trend?"
5. "Top 10 keywords by spend."
6. "Which channels are up / down week over week?"
7. "One number — what should I know right now?"
8. "Break down revenue by segment."
9. "Show me anomalies from this week."
10. "Summarise Q1."

Each should produce a spec that passes the §8 self-check and renders sensibly with the host theme. B5 formalises this as a regression suite against saved spec snapshots.

## 10.3 Known tensions

1. "Never stack two ChartCards directly" is a taste rule, not a correctness rule. If an LLM violates it, the dashboard still works — it's just less readable. Consider downgrading to "prefer" language later.
2. Cost-per-X semantic tone is a judgement call the LLM has to make without context. Possible future optimisation: add a `default_tone_for_increase` hint to each MCP tool based on metric name. The LLM is usually fine at this.
3. Chart `valueKeys` auto-detection copies the current host app's `ChartWidget.tsx` behaviour — works but is fragile across odd data shapes. The MCP tool validates and rejects malformed `data` upstream.
4. Tone tokens grew from 4 → 6 (added `warning`, `info`). Plan v2 §3 listed four. The extras are earned — `warning` for anomaly callouts is a real need, `info` for neutral highlights matches existing app UX. This expands the CSS-var surface by 4 entries.

## 10.4 Open follow-ups

- **Content length budget.** Actual token count of §1–§9 needs measuring once the examples are stable. Rough count suggests ~1200 tokens; verify periodically.
- **Icon set evolution.** The curated list in `primitive-taxonomy.md` §5.5 will grow. The SKILL should reference the catalogue doc rather than inlining the list, so updates don't require skill revisions.
- **Locale handling.** Currency and number formatting tools pass `locale` through to `Intl.NumberFormat`. B3 default is the host environment's locale; host apps can override at render time via `Number`'s `locale` prop.
- **Sparkline data shape.** Current design takes `number[]`. If LLMs struggle with "which number is which", consider `Array<{t: number; v: number}>` for date-aware sparklines. Decide at B5 when the atom ships.
