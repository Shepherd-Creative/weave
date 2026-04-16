import type { TableCardSpec } from "../schemas/organisms.js";
import { DataRow } from "../molecules/DataRow.js";
import { toneToColorVar } from "../utils/theme.js";

export function TableCard(props: Omit<TableCardSpec, "type">): React.JSX.Element {
  const { title, caption, headers, rows, density = "comfortable" } = props;
  const rowPadding = density === "compact" ? "0.375rem 0.75rem" : "0.5rem 0.75rem";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1rem",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
        <div
          style={{
            color: "var(--card-foreground)",
            fontFamily: "var(--font-sans)",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          {title}
        </div>
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
      </header>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-sans)",
          fontSize: "0.875rem",
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--border)",
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
                  fontSize: "0.6875rem",
                  fontWeight: 500,
                  letterSpacing: "0.06em",
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
  );
}
