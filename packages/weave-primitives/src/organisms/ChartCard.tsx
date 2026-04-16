import type { ChartCardSpec } from "../schemas/organisms.js";
import { Chart } from "../molecules/Chart.js";
import { Label } from "../atoms/Label.js";
import { NoteCard } from "./NoteCard.js";

export function ChartCard(props: Omit<ChartCardSpec, "type">): React.JSX.Element {
  const { title, caption, chart, footer } = props;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
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

      <Chart {...chart} />

      {footer ? (
        <footer style={{ marginTop: "0.25rem" }}>
          {footer.type === "Label" ? (
            <Label {...footer} />
          ) : (
            <NoteCard {...footer} />
          )}
        </footer>
      ) : null}
    </div>
  );
}
