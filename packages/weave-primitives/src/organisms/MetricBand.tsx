import type { MetricBandSpec } from "../schemas/organisms.js";
import { densityPadding } from "../utils/style.js";
import { KPI } from "../molecules/KPI.js";

export function MetricBand(props: Omit<MetricBandSpec, "type">): React.JSX.Element {
  const { items, density = "comfortable" } = props;
  const pad = densityPadding(density);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: pad,
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: pad,
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            borderRight: i < items.length - 1 ? "1px solid var(--border)" : "none",
            paddingRight: i < items.length - 1 ? pad : 0,
          }}
        >
          <KPI {...item} />
        </div>
      ))}
    </div>
  );
}
