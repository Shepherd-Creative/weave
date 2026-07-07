# DESIGN-SOURCE ADAPTER SKILL

> **Note to LLM:** This skill teaches you to convert a brand's design source (a
> `DESIGN.md`, a design-token repository or a brand CSS file) into a **Weave
> theme**: a `weave-theme.css`, a composition-brief `DESIGN.md` and a
> `drop-report.json`. You are authoring three static files, offline, once per
> brand. You are not rendering a dashboard and you are not the runtime. Every
> colour you write is a judgement a human will review, so make each decision
> visible. When you finish, a deterministic linter gates your output; you are
> not done until it passes.

---

## What this skill is

An **offline authoring tool**, not a runtime component. Read this before you
touch a single token.

**The strict LLM/CSS split you operate under.** The running Weave system never
lets an LLM emit CSS. At render time the model emits only validated JSON
primitive specs, and the host app's theme supplies every colour, font and
pixel. This skill sits outside that loop. It runs once, up front, to author a
static `weave-theme.css` by human-reviewed judgement. That file is then gated
by a deterministic validator (`weave-theme lint`) and, at runtime, loaded by
the host from an allowlisted path. So the chain is: the model authors a static
file, the validator gates it, the host loads the reviewed result. The model is
never in the runtime CSS path. Nothing you write here reaches a screen until a
human has read your drop report and a deterministic tool has passed your CSS.

**Why a model does this at all.** The mapping is not mechanical. A restrained
brand has no positive/negative/warning/info palette, no eight-colour chart
ramp and no per-role font routing, so those must be *derived*. Derivation is
taste, and taste needs a model. Determinism lives in the gate, not the mapping.

**Output contract.** A directory shaped exactly like
`examples/themes/brand-iron/`:

- `weave-theme.css`: the mapped `:root` block, with `JUDGEMENT CALL` comments inline.
- `DESIGN.md`: the composition brief, appended to the runtime composition skill.
- `drop-report.json`: the machine and human record of what you dropped and every judgement you made.

Name the directory after the brand in kebab-case. In this repository themes
live under `examples/themes/<brand>/`; outside it any directory works, because
the lint gate takes a path.

Read `examples/themes/brand-iron/` in full before you start. It is a manual run
of this exact method against a real brand (Iron Press: editorial brutalism,
warm paper, one saffron accent, hairlines, square corners, Fraunces + JetBrains
Mono). This skill cites it throughout because it is the worked example.

---

## The drop-report schema (version 1)

`drop-report.json` is validated against this schema (from
`weave-theme-cli/src/drop-report.ts`). It is read by the next stage and by a
human reviewer, so it is structured, not prose. Every field is required unless
marked optional.

```jsonc
{
  "version": 1,                       // literal 1
  "brand": "Iron Press",              // brand name
  "sources": ["..."],                 // the design sources you read
  "dropped": [                        // what could not cross the restricted subset
    {
      "signal": "...",                // the brand signal that was lost
      "reason": "...",                // why it could not travel
      "type": "non-token-signature"   // "non-token-signature" | "unsupported-value" | "out-of-contract"
    }
  ],
  "judgementCalls": [                 // every decision you invented, one entry each
    {
      "id": "...",                    // kebab-case stable id
      "decision": "...",              // what you decided
      "rationale": "...",             // why
      "affectedTokens": ["--..."]     // the tokens the decision set
    }
  ],
  "contractGaps": [                   // brand needs no current token can express
    {
      "description": "...",
      "proposedToken": "--..."        // optional: the v-next token you propose
    }
  ]
}
```

Empty arrays are valid and meaningful: `"dropped": []` asserts nothing was
lost, `"contractGaps": []` asserts the contract covered every need. Do not omit
an array to mean empty.

---

## 1. Inventory the design source

**Read the prose rules first, before the tokens.** A brand's composition rules
live in its prose, not its variables. "Never pie", "omit icons", "one chart
max", "type does the work" are all real brand constraints and none of them is a
token. An adapter that reads only the token file ships half a brand.

Accept any of three source shapes:

- a brand `DESIGN.md` (prose plus, sometimes, an inline palette);
- a design-token repository (a `tokens.css`, a Style Dictionary export, a Tailwind theme config); or
- a brand CSS file.

Then **classify every rule you extract into exactly one of two buckets:**

- a **theme mapping** goes to `weave-theme.css` (a colour, a radius, a font stack, a shadow);
- a **composition rule** goes to the `DESIGN.md` brief (density, chart policy, tone discipline, what to omit).

A rule that is both splits across the two. "One saffron accent, used sparingly"
is a colour (`--primary`, `--accent`) AND a discipline ("reserve emphasis for
what demands attention"): the value goes to CSS, the restraint goes to the
brief.

**Worked example.** Iron Press shipped a `tokens.css` (paper, ink, one saffron,
Fraunces + JetBrains Mono, a paper-grain texture) and a set of prose rules
("editorial brutalism", "type does the work", "never pie", "omit icons"). The
tokens became `weave-theme.css`, the prose became `DESIGN.md` and the texture
(a `body::before` rule, not a variable) became a drop. All three destinations,
from one source.

---

## 2. Map structural colours

The contract's twenty **structural** variables map first, and all twenty must
be set (the lint enforces the structural bucket complete):

`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`,
`--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`,
`--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`,
`--accent-foreground`, `--destructive`, `--destructive-foreground`,
`--border`, `--input`, `--ring`, `--radius`.

Map the brand's surfaces (`--background`, `--card`, `--popover`), its ink (the
`-foreground` trio) and its borders from the brand's own values. `rgba()` and
`clamp()` pass the validator, so a translucent hairline or a fluid value is
fine.

**Decide fills versus hairlines.** Brands separate a card from the page in one
of two ways, and the choice is structural:

- with a **fill**: `--card` differs from `--background` (corporate-light: white cards on a grey page); or
- with a **hairline**: `--card` equals `--background` and a visible `--border` carries the structure.

Brand-iron takes the hairline route on purpose: `--card: #ede3cc` equals
`--background: #ede3cc`, and `--border: rgba(28, 22, 17, 0.42)` does the
separating, because Iron Press never separates with fills. Match the brand's
actual habit, do not default to fills.

**Radius is one brand decision** that the surface tokens follow. Square
(`--radius: 0rem`, brand-iron) or soft (`--radius: 0.75rem`, corporate-light).
Set `--weave-radius-sm/md/lg/code` consistently with it.

---

## 3. Derive semantic tones

The contract wants eight tone variables: `--tone-positive`, `--tone-negative`,
`--tone-warning`, `--tone-info` and each `-muted` variant. Most brands ship no
such palette. They have one accent, or a small set, and differentiate through
type and layout. So you must **derive** the tones, and derivation is never
neutral.

**The one-accent policy.** When a brand has a single accent, send that accent
to what genuinely demands attention (the negative and warning tones) and let
ink shades carry the calm states (positive and info). A lone saffron cannot
mean both "good" and "bad" without confusing the reader, so reserve it for
attention and keep positive/info as understated ink. Brand-iron does exactly
this: saffron drives `--tone-negative` and `--tone-warning`, while
`--tone-positive: #4a3f32` and `--tone-info: #806e58` are quiet ink shades.

**Each `-muted` variant is a background, not a text colour**: the tinted
surface a tone sits on for secondary emphasis. Derive it by pulling the tone
toward the surface. Brand-iron washes its saffron states to a translucent tint
over the paper (`--tone-warning: #c8721e` solid, `--tone-warning-muted:
rgba(200, 114, 30, 0.1)`) and rests the ink states on the secondary paper tint
(`#e5d9bb`).

**Every tone derivation is a judgement call.** You are inventing a palette the
brand never specified, so make the invention visible twice, never silently:

1. write an inline `JUDGEMENT CALL` comment in the CSS beside the tone tokens; and
2. add a `judgementCalls[]` entry to the drop report.

The human reviews your invented tones through those two records. A silent guess
is an unreviewable guess.

**Contrast discipline.** Any text-on-accent pair must clear **3:1** (the lint's
hard floor). Check `--primary-foreground` on `--primary` and
`--destructive-foreground` on `--destructive`. The canonical example is the
brand-iron primary-foreground flip: Iron Press's brand rule wanted cream text
on the saffron `--primary`, which reads **2.8:1** and fails the floor. The fix
was not to whitelist the finding but to flip the foreground to ink
(`--primary-foreground: #1c1611`, **5.0:1**), which is how Iron Press
differentiates anyway. That flip carries a `JUDGEMENT CALL` comment in the CSS
and a `judgementCalls[]` entry in the report. Do the same for every pair you
have to bend.

---

## 4. Synthesise the chart ramp

The **palette** bucket wants `--chart-1` through `--chart-8`, all eight set. A
restrained brand almost never ships an eight-colour categorical palette, so
when none exists, synthesise one:

- `--chart-1` is **ink** (the foreground);
- `--chart-2` is the **accent highlight**;
- `--chart-3` through `--chart-8` **walk the neutral ramp** down from ink into the surface tints.

Brand-iron's ramp runs `#1c1611` (ink), `#c8721e` (saffron), then six steps
fading through `#4a3f32`, `#a85a12`, `#806e58`, `#a89478`, `#dccfa8`, `#e5d9bb`.

**A synthesised ramp MUST be paired with a series-count cap in the composition
brief** (step 7). The tail of a walked ramp is by design hard to tell apart, so
the brief must stop the composition ever reaching it. Brand-iron caps charts at
two series, so `--chart-3..8` rarely render even though all eight are set. This
pairing is deliberate: the CSS fades the tail, the brief keeps the composition
off it. The lint checks only `--chart-1` and `--chart-2` for visibility (at
least 1.5:1 against `--card`) and leaves `--chart-3..8` unchecked, precisely
because a series-capped brand legitimately fades the tail.

The ramp is a judgement call. Comment it in the CSS and record it in
`judgementCalls[]`.

---

## 5. Emit font stacks, never font files

The validator rejects `url()` and `@font-face`. No font file travels through
the `:root`-only restricted subset, so a brand face renders only if it is
already installed on the host. Do not try to load one.

**Emit the brand's own documented fallback stack**, not its web font.
Brand-iron's brand face is Fraunces, but the theme ships
`"Fraunces", "Charter", "Georgia", "Times New Roman", serif` (Iron Press's own
fallback rule), so Charter or Georgia carry the serif role wherever Fraunces is
absent. The brand face leads the stack for hosts that do have it; the fallback
does the honest work everywhere else.

**Use the v3 per-role routing tokens** where the brand routes fonts by role:

- `--weave-font-overline`: the face for uppercase overlines and labels. Brand-iron routes the **mono** here (`"JetBrains Mono", "SF Mono", ...`) because its overlines are mono, not serif. Setting this pulls labels and table headers onto the mono while titles and body stay on the serif.
- `--weave-font-numeric`: the face for numeric displays. Brand-iron sets it explicitly to the Fraunces serif, so the routing is exercised end to end rather than left to its default fallback.
- `--weave-font-feature-numeric`: OpenType features for figures. Brand-iron ships `"onum" 1` for oldstyle figures, editorial and visibly distinct from the primitives' tabular-nums baseline.

**Note the future channel.** Host-delivered fonts through the MCP Apps host
context (`applyHostFonts`) is the eventual proper way to ship a brand face to
the view. Until that lands, fallback stacks are the honest ceiling. If a brand
face will not render on a plain host, say so as a `dropped[]` entry or a note,
do not pretend the web font travelled.

Font-routing decisions are judgement calls. Comment and record them.

---

## 6. Record drops and gaps

Anything the brand expresses that cannot travel through the `:root`-only
restricted subset is a **drop**. Record it in `drop-report.json` `dropped[]`
with a `type`:

- `non-token-signature`: a brand signature that is not a token at all. Brand-iron's paper-grain `body::before` radial texture is a real part of the look, but it is a pseudo-element rule, not a `:root` variable, so it cannot survive the subset.
- `unsupported-value`: a value the validator refuses (a `url()`, an `@import`, an at-rule, a selector other than `:root`).
- `out-of-contract`: a brand need that maps to no token the contract currently has.

A brand need that is still unexpressible after you have mapped everything you
can becomes a `contractGaps[]` entry, proposing a v-next token
(`proposedToken` is optional). This is how the contract learns: the two v3
font-routing tokens (`--weave-font-overline`, `--weave-font-feature-numeric`)
began life as brand-iron contract gaps and then shipped, which is why a
brand-iron run today records no gaps for them.

**The report is not optional.** It is how the human reviews what the adapter
decided: the drops it accepted, the tones it invented, the gaps it found.
Ship without it and the review has nothing to read. `weave-theme lint`'s
`--require-drop-report` makes a missing report a hard error for exactly this
reason, so a shipped theme always carries its own rationale.

---

## 7. Write the composition brief

`DESIGN.md` is the composition brief: the prose rules from step 1 that steer the
agent's composition, not its styling. Keep it short and specific to the brand.
Cover:

- **density**: spacious, comfortable or compact, and when;
- **chart policy**: which variants are allowed, how many charts and the series cap that pairs with your synthesised ramp;
- **tone discipline**: when to reach for a tone versus staying `default` or `muted`;
- **terminology and voice**: caption register, sentence case versus uppercase, what to omit (brand-iron omits `icon` fields entirely).

Include a mandatory **Proactive triggers** section: when should the agent render
a dashboard *unprompted* for this brand. State a threshold and the restraint.
Brand-iron's rule is the model: "three or more related figures render as a
dashboard; a single number stays prose or one hero KPI; never decorate."

**The brief is appended to the runtime composition skill**
(`weave-skill/SKILL.md`), so it must never contradict that skill's contract. It
instructs **composition only**: what to show, which primitive, which tone, which
density. It **never** instructs CSS, colours or pixel values, because those are
the theme's job and the composition skill forbids the model touching them. A
brief line like "use saffron for warnings" is wrong (it names a colour);
"reserve the `warning` tone for the one thing that genuinely demands attention"
is right (it is a composition rule). Read `examples/themes/brand-iron/DESIGN.md`
as the reference for register and scope.

---

## 8. Gate and review

Run the deterministic gate until it exits 0:

```bash
weave-theme lint <dir> --require-drop-report
# in this repo, before the CLI is installed on PATH:
node packages/weave-theme-cli/dist/cli.js lint <dir> --require-drop-report
```

**Exit 0 is the bar.** Aim for:

- **zero `UNKNOWN_VARIABLE`**: no typo'd or invented variable. The runtime would silently strip these; the lint makes them loud so they never ship.
- **`structural`, `tone` and `palette` complete**: a missing variable in any of the three enforced buckets is `COVERAGE_INCOMPLETE`, an error. The other buckets (`chart-treatment`, `typography`, `spacing`, `surface`) are report-only: partial coverage there is a legitimate brand choice.
- **no `CONTRAST_FAIL`**: a text pair below 3:1 is a hard error. Fix the theme (usually a foreground flip, see step 3), never whitelist it.
- **`drop-report.json` present and schema-valid**: `DROP_REPORT_INVALID` is an error, and `--require-drop-report` makes `DROP_REPORT_MISSING` one too.

**Warnings are brand judgement to be reviewed, not silenced.** `CONTRAST_LOW`
(a pair below the 4.5:1 target, or a muted/tone pair below 3:1) and
`CHART_INVISIBLE` are warnings, not errors. Brand-iron ships three `CONTRAST_LOW`
warnings on purpose: saffron `--tone-warning` reads 2.8:1 on warm paper, and the
`--destructive` pair reads 3.98:1. Each is a deliberate brand choice, recorded
as a judgement call, not a defect to paper over. Do not chase a warning to zero
by distorting the brand. Surface it for the human and let them decide.

**Then present the human-review summary in this order:**

1. **Judgement calls first**: every tone you invented, every contrast flip, every ramp decision. This is what needs a human's eyes.
2. **Drops second**: what did not survive the subset, and why.
3. **Coverage third**: which buckets are complete, which are report-only.

**Output contract, restated.** A kebab-case brand directory (in this repo,
`examples/themes/<brand>/`) shaped exactly like `examples/themes/brand-iron/`:
`weave-theme.css` (with `JUDGEMENT CALL` comments) plus `DESIGN.md` plus
`drop-report.json`. Anything short of all three, gated to exit 0, is not done.

---

# END OF SKILL CONTENT
