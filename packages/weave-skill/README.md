# @shepherd-creative/weave-skill

The SKILL.md that teaches an LLM how to compose Weave primitive specs, plus a loader utility.

## Install

```bash
pnpm add @shepherd-creative/weave-skill
```

## Use

```ts
import { loadSkill } from "@shepherd-creative/weave-skill";

// At server startup, concatenate the skill into your system prompt:
const SYSTEM_PROMPT = [
  "You are an AI assistant for my app.",
  "...other instructions...",
  loadSkill(),
].join("\n\n");
```

The skill is Node-only (reads from disk via `fileURLToPath`).

## What's in the skill

- §1 When to use the skill
- §2 The core contract (JSON specs, theme-neutral)
- §3 Six tone semantics with user-POV guidance
- §4 Five-level size hierarchy
- §5 Composition rules (structure, density, chart selection, deltas, tables)
- §6 What NOT to do
- §7 Three worked examples (Q1 perf, campaign compare, one-liner)
- §8 Pre-emit self-check
- §9 Primitive catalogue reference

Design rationale lives in `NOTES.md` (shipped with the package but not shipped to the LLM).

## License

MIT. See [LICENSE](../../LICENSE) at the repository root.
