import type { StatSpec } from "../schemas/molecules.js";
import { formatNumber } from "../utils/format.js";
import { numberFontSize } from "../utils/style.js";
import { toneToColorVar } from "../utils/theme.js";

export function Stat(props: Omit<StatSpec, "type">): React.JSX.Element {
  const { label, value, format, precision, size = "md", tone, delta } = props;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--weave-space-3xs, 0.125rem)" }}
    >
      <div
        style={{
          color: "var(--muted-foreground)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--weave-font-size-xs, 0.75rem)",
          fontWeight: "var(--weave-font-weight-medium, 500)",
          letterSpacing: "var(--weave-letter-spacing-wide, 0.03em)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--weave-space-sm, 0.5rem)",
        }}
      >
        <span
          style={{
            color: toneToColorVar(tone),
            fontSize: numberFontSize(size),
            fontWeight: "var(--weave-font-weight-semibold, 600)",
            fontVariantNumeric: "tabular-nums",
            fontFeatureSettings: "var(--weave-font-feature-numeric, normal)",
            fontFamily: "var(--weave-font-numeric, var(--font-display))",
            lineHeight: "var(--weave-line-height-snug, 1.2)",
          }}
        >
          {formatNumber(value, { format, precision })}
        </span>
        {delta ? (
          <span
            style={{
              color: toneToColorVar(delta.tone),
              // delta stays on --font-sans by design: routing through
              // --weave-font-numeric would change un-themed rendering.
              fontFamily: "var(--font-sans)",
              fontSize: "var(--weave-font-size-xs, 0.75rem)",
              fontWeight: "var(--weave-font-weight-medium, 500)",
              fontVariantNumeric: "tabular-nums",
              fontFeatureSettings: "var(--weave-font-feature-numeric, normal)",
            }}
          >
            {formatNumber(delta.value, { format: delta.format ?? "percent", showSign: true })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
