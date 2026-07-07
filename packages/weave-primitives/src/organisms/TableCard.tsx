import { DataRow } from "../molecules/DataRow.js";
import type { TableCardSpec } from "../schemas/organisms.js";
import { toneToColorVar } from "../utils/theme.js";

export function TableCard(props: Omit<TableCardSpec, "type">): React.JSX.Element {
  const { title, caption, headers, rows, density = "comfortable" } = props;
  const rowPadding =
    density === "compact"
      ? "var(--weave-space-xs, 0.375rem) var(--weave-space-md, 0.75rem)"
      : "var(--weave-space-sm, 0.5rem) var(--weave-space-md, 0.75rem)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--weave-space-sm, 0.5rem)",
        backgroundColor: "var(--card)",
        border: "var(--weave-card-border-width, 1px) solid var(--border)",
        borderRadius: "var(--weave-radius-md, var(--radius))",
        padding: "var(--weave-card-padding, 1rem)",
        boxShadow: "var(--weave-card-shadow, none)",
      }}
    >
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--weave-space-3xs, 0.125rem)",
        }}
      >
        <div
          style={{
            color: "var(--card-foreground)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--weave-font-size-sm, 0.875rem)",
            fontWeight: "var(--weave-font-weight-semibold, 600)",
          }}
        >
          {title}
        </div>
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
      </header>

      {/* Horizontal-scroll wrapper: when total column content exceeds the
          card's inline-size the table scrolls inside the wrapper rather
          than spilling past the card's border. */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--weave-font-size-sm, 0.875rem)",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "var(--weave-card-border-width, 1px) solid var(--border)",
              }}
            >
              {headers.map((h, i) => (
                <th
                  key={i}
                  scope="col"
                  style={{
                    color: toneToColorVar(h.tone ?? "muted"),
                    textAlign: h.align ?? "start",
                    padding: rowPadding,
                    fontSize: "var(--weave-font-size-overline, 0.6875rem)",
                    fontWeight: "var(--weave-font-weight-medium, 500)",
                    letterSpacing: "var(--weave-letter-spacing-widest, 0.06em)",
                    textTransform: "uppercase",
                  }}
                >
                  {h.text}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <DataRow key={i} cells={row.cells} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
