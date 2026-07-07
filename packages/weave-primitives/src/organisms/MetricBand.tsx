import { KPI } from "../molecules/KPI.js";
import type { MetricBandSpec } from "../schemas/organisms.js";
import { densityPadding } from "../utils/style.js";

export function MetricBand(props: Omit<MetricBandSpec, "type">): React.JSX.Element {
  const { items, density = "comfortable" } = props;
  const pad = densityPadding(density);

  return (
    <div
      style={{
        display: "grid",
        // Auto-fit wrapping: cells don't shrink below ~180px. At wider
        // containers the band stays on one row; in narrow host cards
        // (e.g. a 376px WidgetCard in a 2-column side panel) it wraps to
        // 2×2 or 1×N so KPI values always have room to render.
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
        gap: pad,
        backgroundColor: "var(--card)",
        border: "var(--weave-card-border-width, 1px) solid var(--border)",
        borderRadius: "var(--weave-radius-md, var(--radius))",
        padding: pad,
        boxShadow: "var(--weave-card-shadow, none)",
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            // `min-width: 0` lets the grid cell shrink so the KPI's
            // `text-overflow: ellipsis` inside it can actually trigger.
            minWidth: 0,
          }}
        >
          <KPI {...item} />
        </div>
      ))}
    </div>
  );
}
