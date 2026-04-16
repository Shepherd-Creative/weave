import type { KPISpec } from "../schemas/molecules.js";
import { formatNumber } from "../utils/format.js";
import { numberFontSize } from "../utils/style.js";
import { toneToColorVar } from "../utils/theme.js";
import { Icon } from "../atoms/Icon.js";

export function KPI(props: Omit<KPISpec, "type">): React.JSX.Element {
  const {
    label,
    value,
    format,
    precision,
    currency,
    size = "lg",
    tone,
    delta,
    icon,
    caption,
    // sparkline intentionally ignored in B3; Sparkline atom lands in B5.
  } = props;

  const valueText = formatNumber(value, { format, precision, currency });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        padding: "0.5rem 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          color: "var(--muted-foreground)",
          fontFamily: "var(--font-sans)",
          fontSize: "0.75rem",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {icon ? <Icon name={icon} size="xs" tone="muted" /> : null}
        <span>{label}</span>
      </div>

      <div
        style={{
          color: toneToColorVar(tone),
          fontSize: numberFontSize(size),
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "var(--font-display)",
          lineHeight: 1.1,
        }}
      >
        {valueText}
      </div>

      {delta ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: toneToColorVar(delta.tone ?? "muted"),
            fontFamily: "var(--font-sans)",
            fontSize: "0.875rem",
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatNumber(delta.value, {
            format: delta.format ?? "percent",
            showSign: delta.showSign ?? true,
          })}
        </div>
      ) : null}

      {caption ? (
        <div
          style={{
            color: "var(--muted-foreground)",
            fontFamily: "var(--font-sans)",
            fontSize: "0.75rem",
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
}
