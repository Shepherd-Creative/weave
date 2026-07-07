# Future Direction: Design-Source Integration

> **Status:** Largely implemented (2026-07-07) on `feat/mcp-app-design-source`, per the spec at
> `docs/superpowers/specs/2026-07-06-mcp-app-design-source-design.md`. Shipped: the expanded
> `--weave-*` token contract (v2), var()-routed primitives, `weave-mcp-app` with
> `WEAVE_THEME_CSS_PATH` / `WEAVE_DESIGN_GUIDANCE_PATH`, `validateThemeCss` and two demo brands
> under `examples/themes/`. Still unscheduled: the deterministic format adapter that derives a
> Weave theme from an arbitrary `DESIGN.md` or design-token repository (hosts currently author
> `weave-theme.css` by hand), runtime theme switching and multi-brand registries.

## Intent

Allow Weave-generated interfaces to reflect a person's visual preferences or an organisation's brand system. A host should be able to point Weave at sources such as:

- a `DESIGN.md` containing visual and composition guidance;
- an existing CSS or design-token repository; or
- a small, explicit Weave theme file.

Weave should use those sources without allowing the LLM to generate arbitrary CSS. The existing responsibility split remains useful:

- the LLM decides what information to show, its hierarchy, arrangement, density, and semantic tone;
- deterministic theme code decides the actual colours, typography, spacing, borders, and other visual values.

## Suggested Architecture

```text
DESIGN.md + brand CSS/design-token repository
                     |
                     v
        deterministic design-source adapter
              /                     \
             v                       v
 brand-composition.md          weave-theme.css
  supplied to the LLM        injected into the View
```

The adapter should produce two different outputs because composition guidance and rendered styling have different consumers.

### Composition guidance

`brand-composition.md` would contain the parts of the design source that affect the agent's decisions, for example:

- preferred information density and hierarchy;
- chart-selection and data-visualisation conventions;
- tone, voice, and terminology;
- when to use restrained versus prominent presentation; and
- brand-specific accessibility requirements.

The host would append this guidance to the existing Weave composition skill. The agent would continue emitting only validated Weave JSON specifications.

### Rendered theme

`weave-theme.css` would map the source design system onto Weave's CSS-variable contract. The MCP App View would inject this stylesheet when rendering a specification.

The current contract covers structural colours, semantic tones, chart colours, font families, and border radius. Full brand fidelity would require expanding it to cover at least:

- typography scale, weights, and line heights;
- spacing and density scales;
- card borders, radii, and shadows;
- chart axes, grids, labels, and tooltip treatment; and
- component-specific surface and emphasis rules.

This expansion is necessary because several of those values are currently hard-coded inside the primitive components.

## MCP App Integration

A future MCP App could accept an explicitly configured theme rather than reading arbitrary paths supplied by a tool call. Possible configuration could include:

```text
WEAVE_DESIGN_GUIDANCE_PATH=/approved/brand/DESIGN.md
WEAVE_THEME_CSS_PATH=/approved/brand/weave-theme.css
```

At startup, the app would:

1. Resolve both paths against an allowlisted directory.
2. Validate the generated CSS against the supported Weave token names.
3. Append the composition guidance to the base Weave skill.
4. Bundle or inject the validated theme into the `ui://` View resource.
5. Fall back to `@shepherd-creative/weave-tokens` when no custom theme is configured.

The first version should support one configured theme per server process. Runtime theme switching and multi-brand registries can be added later if a concrete host application requires them.

## Safety and Reliability

- Tool arguments must not contain unrestricted local filesystem paths.
- Design sources must be read only from configured, allowlisted locations.
- CSS should be converted into or checked against a known token surface; arbitrary scripts, remote imports, and executable build hooks should not be accepted.
- Missing or invalid brand inputs should produce a clear diagnostic and use the default theme where safe.
- The adapter output should be deterministic and suitable for snapshot testing.

## Suggested Delivery Sequence

1. Expand and document the Weave CSS-variable contract.
2. Replace hard-coded visual values in primitives with those variables.
3. Define the accepted `DESIGN.md` guidance structure.
4. Build a deterministic adapter for `DESIGN.md` and CSS variables.
5. Add configured theme loading to the planned MCP App.
6. Test a default theme and at least two substantially different brand themes against the same saved Weave specifications.

## Success Criteria

The integration is successful when the same validated dashboard specification can be rendered in materially different brand styles without changing the specification, while the agent's layout and emphasis choices also follow the selected brand guidance.

