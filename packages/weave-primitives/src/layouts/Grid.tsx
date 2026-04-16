import type { GridSpec } from "../schemas/layouts.js";
import type { Spec } from "../schemas/spec.js";
import { gapValue } from "../utils/style.js";

// Imported lazily via prop to avoid a circular module boundary; the
// renderer passes the Spec dispatcher down through the children callback.
type Props = Omit<GridSpec, "type"> & {
  renderChild: (child: Spec, key: number) => React.ReactNode;
};

export function Grid({ cols = "auto", gap, children, renderChild }: Props): React.JSX.Element {
  const gridTemplateColumns =
    cols === "auto"
      ? `repeat(auto-fit, minmax(240px, 1fr))`
      : `repeat(${cols}, minmax(0, 1fr))`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns,
        gap: gapValue(gap),
      }}
    >
      {children.map((child, i) => renderChild(child as Spec, i))}
    </div>
  );
}
