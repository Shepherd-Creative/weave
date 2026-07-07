/**
 * Colour parsing and WCAG relative-luminance / contrast-ratio maths.
 *
 * Deliberately narrow: this package only needs to understand the colour
 * syntaxes a hand-authored Weave theme is likely to use (hex, `rgb()`,
 * `rgba()`). Anything else — `clamp()`, `color-mix()`, `oklch()`, named
 * keywords, gradients — is out of scope by design and `parseColor` returns
 * `null` for it. Callers (contrast.ts) treat a `null` parse as "unparseable"
 * and record a skip rather than fail the lint.
 */

export type RGBA = { r: number; g: number; b: number; a: number };
export type RGB = { r: number; g: number; b: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function expandHexDigit(digit: string): string {
  return digit + digit;
}

function parseHex(hex: string): RGBA | null {
  if (hex.length === 3 || hex.length === 4) {
    const r = Number.parseInt(expandHexDigit(hex[0] ?? ""), 16);
    const g = Number.parseInt(expandHexDigit(hex[1] ?? ""), 16);
    const b = Number.parseInt(expandHexDigit(hex[2] ?? ""), 16);
    const aDigit = hex[3];
    const a = aDigit !== undefined ? Number.parseInt(expandHexDigit(aDigit), 16) / 255 : 1;
    if ([r, g, b].some((c) => Number.isNaN(c)) || Number.isNaN(a)) return null;
    return { r, g, b, a };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some((c) => Number.isNaN(c)) || Number.isNaN(a)) return null;
    return { r, g, b, a };
  }
  return null;
}

/** Parses one `rgb()`/`rgba()` component: plain number (0-255) or a percentage. */
function parseRgbComponent(token: string): number | null {
  const isPercent = token.endsWith("%");
  const raw = isPercent ? token.slice(0, -1) : token;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const value = isPercent ? (num / 100) * 255 : num;
  return clamp(value, 0, 255);
}

/** Parses an `rgb()`/`rgba()` alpha component: 0-1 float or a percentage. */
function parseAlphaComponent(token: string): number | null {
  const isPercent = token.endsWith("%");
  const raw = isPercent ? token.slice(0, -1) : token;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const value = isPercent ? num / 100 : num;
  return clamp(value, 0, 1);
}

function parseRgbFunction(body: string): RGBA | null {
  // Accepts both the classic comma syntax (`rgb(1, 2, 3)`, `rgba(1,2,3,.5)`)
  // and the modern space syntax (`rgb(1 2 3)`, `rgb(1 2 3 / .5)`) by folding
  // both separators down to whitespace before splitting.
  const tokens = body.replace(/[,/]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 3 && tokens.length !== 4) return null;
  const r = parseRgbComponent(tokens[0] ?? "");
  const g = parseRgbComponent(tokens[1] ?? "");
  const b = parseRgbComponent(tokens[2] ?? "");
  if (r === null || g === null || b === null) return null;
  let a = 1;
  if (tokens.length === 4) {
    const parsedAlpha = parseAlphaComponent(tokens[3] ?? "");
    if (parsedAlpha === null) return null;
    a = parsedAlpha;
  }
  return { r, g, b, a };
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_FN_RE = /^rgba?\(\s*(.+?)\s*\)$/i;

/**
 * Parses a CSS colour literal into 0-255 RGB + 0-1 alpha.
 *
 * Supported: `#rgb #rgba #rrggbb #rrggbbaa`, `rgb(r g b / a)`, `rgb(r,g,b)`,
 * `rgba(r,g,b,a)`, with r/g/b as plain numbers or percentages. Anything else
 * (`clamp()`, `color-mix()`, `oklch()`, named keywords, gradients, `var()`)
 * returns `null` — `var()` resolution is handled one level up, in contrast.ts.
 */
export function parseColor(input: string): RGBA | null {
  const value = input.trim();
  const hexMatch = value.match(HEX_RE);
  if (hexMatch?.[1]) return parseHex(hexMatch[1]);
  const fnMatch = value.match(RGB_FN_RE);
  if (fnMatch?.[1]) return parseRgbFunction(fnMatch[1]);
  return null;
}

/**
 * Composites `fg` (with its own alpha) over an opaque `base`, channel by
 * channel: `out = fg*a + base*(1-a)`. `base`'s own alpha (if any) is ignored
 * — it is treated as the opaque backdrop, matching the CSS custom-property
 * pairs this tool checks (a themed background colour IS the base, not a
 * layer over something else).
 */
export function compositeOver(fg: RGBA, base: RGB): RGB {
  return {
    r: fg.r * fg.a + base.r * (1 - fg.a),
    g: fg.g * fg.a + base.g * (1 - fg.a),
    b: fg.b * fg.a + base.b * (1 - fg.a),
  };
}

function srgbChannel(c: number): number {
  const normalised = c / 255;
  return normalised <= 0.03928 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an opaque RGB colour, 0 (black) to 1 (white). */
export function relativeLuminance(rgb: RGB): number {
  const r = srgbChannel(rgb.r);
  const g = srgbChannel(rgb.g);
  const b = srgbChannel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colours, from 1 (identical) to 21 (black/white). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
