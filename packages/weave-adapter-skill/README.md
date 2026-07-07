# @shepherd-creative/weave-adapter-skill

The `SKILL.md` that teaches an LLM to convert a brand's design source (a
`DESIGN.md`, a design-token repository or a brand CSS file) into a validated
Weave theme, plus a loader utility.

This is an **offline authoring method, not a runtime dependency**. The running
Weave system never lets an LLM emit CSS. This skill sits outside that loop: it
runs once per brand to author a static `weave-theme.css`, a composition-brief
`DESIGN.md` and a `drop-report.json`. A deterministic linter
([`@shepherd-creative/weave-theme-cli`](../weave-theme-cli)) then gates the
output before it ships. The model authors, the validator gates, the host loads a
reviewed static file.

## Install

```bash
pnpm add @shepherd-creative/weave-adapter-skill
```

## Feed it to any agent

`loadSkill()` returns the raw `SKILL.md`. Load it into an agent's skill slot or
concatenate it into a system prompt:

```ts
import { loadSkill } from "@shepherd-creative/weave-adapter-skill";

const SYSTEM_PROMPT = [
  "You are authoring a Weave brand theme.",
  loadSkill(),
].join("\n\n");
```

The skill is Node-only (reads from disk via `fileURLToPath`). Harnesses that
prefer a file path can read `SKILL.md` directly from the package, or call
`skillPath()`.

## The method

Eight steps, each a stable numbered section in `SKILL.md`:

1. Inventory the design source (read the prose rules first).
2. Map structural colours (surfaces, ink, borders, fills-vs-hairlines, radius).
3. Derive semantic tones (the one-accent policy; every derivation a judgement call).
4. Synthesise the chart ramp (ink + accent + neutral walk, paired with a series cap).
5. Emit font stacks, never font files (fallback stacks + the v3 routing tokens).
6. Record drops and gaps (`drop-report.json`).
7. Write the composition brief (`DESIGN.md`, with proactive triggers).
8. Gate and review (`weave-theme lint <dir> --require-drop-report` to exit 0).

## The gate

Output is gated by the `weave-theme` CLI. Run it until it exits 0:

```bash
weave-theme lint <dir> --require-drop-report
```

See [`@shepherd-creative/weave-theme-cli`](../weave-theme-cli) for the full
finding vocabulary, coverage buckets and contrast thresholds.

## Output contract

A directory shaped exactly like [`examples/themes/brand-iron/`](../../examples/themes/brand-iron):
`weave-theme.css` (with `JUDGEMENT CALL` comments) + `DESIGN.md` +
`drop-report.json`. That worked example is a manual run of this exact method
against a real brand; the skill cites it throughout.

## License

MIT. See [LICENSE](../../LICENSE) at the repository root.
