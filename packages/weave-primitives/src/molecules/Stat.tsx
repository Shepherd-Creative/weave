import type { StatSpec } from "../schemas/molecules.js";
import { formatNumber } from "../utils/format.js";
import { numberFontSize } from "../utils/style.js";
import { toneToColorVar } from "../utils/theme.js";

export function Stat(props: Omit<StatSpec, "type">): React.JSX.Element {
  const { label, value, format, precision, size = "md", tone, delta } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
      <div
        style={{
          color: "var(--muted-foreground)",
          fontFamily: "var(--font-sans)",
          fontSize: "0.75rem",
          fontWeight: 500,
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.5rem",
        }}
      >
        <span
          style={{
            color: toneToColorVar(tone),
            fontSize: numberFontSize(size),
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            fontFamily: "var(--font-display)",
            lineHeight: 1.2,
          }}
        >
          {formatNumber(value, { format, precision })}
        </span>
        {delta ? (
          <span
            style={{
              color: toneToColorVar(delta.tone),
              fontFamily: "var(--font-sans)",
              fontSize: "0.75rem",
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatNumber(delta.value, { format: delta.format ?? "percent", showSign: true })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
