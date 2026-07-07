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
        gap: "var(--weave-space-md, 0.75rem)",
        backgroundColor: "var(--card)",
        border: "var(--weave-card-border-width, 1px) solid var(--border)",
        borderRadius: "var(--weave-radius-md, var(--radius))",
        padding: "var(--weave-card-padding, 1rem)",
        boxShadow: "var(--weave-card-shadow, none)",
      }}
    >
      <header
        style={{ display: "flex", flexDirection: "column", gap: "var(--weave-space-3xs, 0.125rem)" }}
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

      <Chart {...chart} />

      {footer ? (
        <footer style={{ marginTop: "var(--weave-space-2xs, 0.25rem)" }}>
          {footer.type === "Label" ? <Label {...footer} /> : <NoteCard {...footer} />}
        </footer>
      ) : null}
    </div>
  );
}
