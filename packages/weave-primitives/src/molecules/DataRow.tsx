import type { DataCell, DataRowSpec } from "../schemas/molecules.js";
import { formatNumber } from "../utils/format.js";
import { toneToColorVar, toneToMutedBgVar } from "../utils/theme.js";

function renderCell(cell: DataCell, key: number): React.JSX.Element {
  switch (cell.kind) {
    case "text":
      return (
        <td
          key={key}
          style={{
            color: toneToColorVar(cell.tone),
            textAlign: cell.align ?? "start",
            padding: "var(--weave-space-sm, 0.5rem) var(--weave-space-md, 0.75rem)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--weave-font-size-sm, 0.875rem)",
          }}
        >
          {cell.value}
        </td>
      );

    case "number":
      return (
        <td
          key={key}
          style={{
            color: toneToColorVar(cell.tone),
            textAlign: "end",
            padding: "var(--weave-space-sm, 0.5rem) var(--weave-space-md, 0.75rem)",
            fontVariantNumeric: "tabular-nums",
            fontFeatureSettings: "var(--weave-font-feature-numeric, normal)",
            fontFamily: "var(--weave-font-numeric, var(--font-display))",
            fontSize: "var(--weave-font-size-sm, 0.875rem)",
          }}
        >
          {formatNumber(cell.value, {
            format: cell.format,
            precision: cell.precision,
            currency: cell.currency,
          })}
        </td>
      );

    case "badge": {
      const variant = cell.variant ?? "soft";
      const color = toneToColorVar(cell.tone);
      const isSoft = variant === "soft";
      const isOutline = variant === "outline";
      return (
        <td
          key={key}
          style={{
            padding: "var(--weave-space-sm, 0.5rem) var(--weave-space-md, 0.75rem)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--weave-font-size-xs, 0.75rem)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--weave-space-2xs, 0.25rem)",
              padding: "var(--weave-space-3xs, 0.125rem) var(--weave-space-sm, 0.5rem)",
              borderRadius: "var(--weave-radius-md, var(--radius))",
              color: isSoft ? color : isOutline ? color : "var(--background)",
              backgroundColor: isSoft
                ? toneToMutedBgVar(cell.tone)
                : isOutline
                  ? "transparent"
                  : color,
              border: isOutline ? `var(--weave-card-border-width, 1px) solid ${color}` : "none",
              fontWeight: "var(--weave-font-weight-medium, 500)",
            }}
          >
            {cell.value}
          </span>
        </td>
      );
    }

    case "delta":
      return (
        <td
          key={key}
          style={{
            color: toneToColorVar(cell.tone),
            textAlign: "end",
            padding: "var(--weave-space-sm, 0.5rem) var(--weave-space-md, 0.75rem)",
            fontVariantNumeric: "tabular-nums",
            fontFeatureSettings: "var(--weave-font-feature-numeric, normal)",
            fontFamily: "var(--weave-font-numeric, var(--font-display))",
            fontSize: "var(--weave-font-size-sm, 0.875rem)",
            fontWeight: "var(--weave-font-weight-medium, 500)",
          }}
        >
          {formatNumber(cell.value, { format: cell.format ?? "percent", showSign: true })}
        </td>
      );

    case "sparkline":
      // Sparkline atom ships in B5; B3 renders a placeholder dash.
      return (
        <td
          key={key}
          style={{
            color: "var(--muted-foreground)",
            textAlign: "center",
            padding: "var(--weave-space-sm, 0.5rem) var(--weave-space-md, 0.75rem)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--weave-font-size-xs, 0.75rem)",
          }}
          title={`Sparkline with ${cell.data.length} points — renders in B5`}
        >
          —
        </td>
      );
  }
}

export function DataRow(props: Omit<DataRowSpec, "type">): React.JSX.Element {
  return <tr>{props.cells.map((cell, i) => renderCell(cell, i))}</tr>;
}
