import { Icon } from "../atoms/Icon.js";
import type { KPISpec } from "../schemas/molecules.js";
import { formatNumber } from "../utils/format.js";
import { numberFontSize } from "../utils/style.js";
import { toneToColorVar } from "../utils/theme.js";

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
        gap: "var(--weave-space-2xs, 0.25rem)",
        padding: "var(--weave-space-sm, 0.5rem) 0",
        // Container-query root so `cqi`-based font sizes in Number / Label
        // resolve against this KPI's inline-size, not the viewport.
        containerType: "inline-size",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--weave-space-xs, 0.375rem)",
          color: "var(--muted-foreground)",
          fontFamily: "var(--weave-font-overline, var(--font-sans))",
          fontSize: "var(--weave-font-size-xs, 0.75rem)",
          fontWeight: "var(--weave-font-weight-medium, 500)",
          letterSpacing: "var(--weave-letter-spacing-wider, 0.04em)",
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
          fontWeight: "var(--weave-font-weight-bold, 700)",
          fontVariantNumeric: "tabular-nums",
          fontFeatureSettings: "var(--weave-font-feature-numeric, normal)",
          fontFamily: "var(--weave-font-numeric, var(--font-display))",
          lineHeight: "var(--weave-line-height-tight, 1.1)",
          // Safety net for narrow containers (e.g. MetricBand cell in a
          // side-panel card): clip instead of letting the value bleed into
          // adjacent cells. When this triggers, authors/LLMs should switch
          // to compact formatting.
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {valueText}
      </div>

      {delta ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--weave-space-2xs, 0.25rem)",
            color: toneToColorVar(delta.tone ?? "muted"),
            // delta stays on --font-sans by design: routing through
            // --weave-font-numeric would change un-themed rendering.
            fontFamily: "var(--font-sans)",
            fontSize: "var(--weave-font-size-sm, 0.875rem)",
            fontWeight: "var(--weave-font-weight-medium, 500)",
            fontVariantNumeric: "tabular-nums",
            fontFeatureSettings: "var(--weave-font-feature-numeric, normal)",
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
            fontSize: "var(--weave-font-size-xs, 0.75rem)",
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
}
