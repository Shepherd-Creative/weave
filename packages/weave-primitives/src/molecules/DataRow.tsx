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
            padding: "0.5rem 0.75rem",
            fontFamily: "var(--font-sans)",
            fontSize: "0.875rem",
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
            padding: "0.5rem 0.75rem",
            fontVariantNumeric: "tabular-nums",
            fontFamily: "var(--font-display)",
            fontSize: "0.875rem",
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
            padding: "0.5rem 0.75rem",
            fontFamily: "var(--font-sans)",
            fontSize: "0.75rem",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              padding: "0.125rem 0.5rem",
              borderRadius: "var(--radius)",
              color: isSoft ? color : isOutline ? color : "var(--background)",
              backgroundColor: isSoft
                ? toneToMutedBgVar(cell.tone)
                : isOutline
                  ? "transparent"
                  : color,
              border: isOutline ? `1px solid ${color}` : "none",
              fontWeight: 500,
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
            padding: "0.5rem 0.75rem",
            fontVariantNumeric: "tabular-nums",
            fontFamily: "var(--font-display)",
            fontSize: "0.875rem",
            fontWeight: 500,
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
            padding: "0.5rem 0.75rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
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
