import type { StackSpec } from "../schemas/layouts.js";
import type { Spec } from "../schemas/spec.js";
import { gapValue } from "../utils/style.js";

type Props = Omit<StackSpec, "type"> & {
  renderChild: (child: Spec, key: number) => React.ReactNode;
};

export function Stack({
  direction = "vertical",
  gap,
  align,
  justify,
  children,
  renderChild,
}: Props): React.JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction === "horizontal" ? "row" : "column",
        gap: gapValue(gap),
        alignItems: align,
        justifyContent:
          justify === "between" ? "space-between" : justify ? `flex-${justify}` : undefined,
      }}
    >
      {children.map((child, i) => renderChild(child as Spec, i))}
    </div>
  );
}
