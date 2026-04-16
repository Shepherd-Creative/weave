# @shepherd-creative/weave-tokens

Default CSS variables for Weave primitives. **Opt-in**.

Most host apps won't import this file — they already have shadcn-style variables and only need to add the Weave-specific additions. This package is for apps that want sensible defaults out of the box.

## Install

```bash
pnpm add @shepherd-creative/weave-tokens
```

## Use

```css
@import "@shepherd-creative/weave-tokens/tokens.css";
```

Or in the host app's root layout:

```tsx
import "@shepherd-creative/weave-tokens/tokens.css";
```

## What this package defines

- **Structural** (shadcn-inherited): `--background`, `--foreground`, `--card`, `--card-foreground`, `--border`, `--muted`, `--muted-foreground`, `--primary`, `--primary-foreground`, `--destructive`, `--destructive-foreground`, `--radius`.
- **Semantic tones** (Weave additions): `--tone-positive`, `--tone-negative`, `--tone-warning`, `--tone-info`, each with a `-muted` variant.
- **Chart palette**: `--chart-1` through `--chart-8`.
- **Typography**: `--font-sans`, `--font-mono`, `--font-display`.

## Custom theming

Override any of the above in your own stylesheet after importing:

```css
@import "@shepherd-creative/weave-tokens/tokens.css";

:root {
  --tone-positive: #22c55e;
  --chart-1: #ec4899;
}
```
