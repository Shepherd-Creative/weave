import type { LabelSpec } from "../schemas/atoms.js";
import { labelFontSize, labelRoleStyle } from "../utils/style.js";
import { toneToColorVar } from "../utils/theme.js";

export function Label(props: Omit<LabelSpec, "type">): React.JSX.Element {
  const { text, role, size, tone, align } = props;
  const roleStyle = labelRoleStyle(role);

  return (
    <span
      style={{
        display: "inline-block",
        color: toneToColorVar(
          tone ?? (role === "caption" || role === "overline" ? "muted" : "default"),
        ),
        fontSize: labelFontSize(size, role),
        fontFamily:
          role === "display"
            ? "var(--font-display)"
            : role === "overline"
              ? "var(--weave-font-overline, var(--font-sans))"
              : "var(--font-sans)",
        fontWeight: roleStyle.fontWeight,
        letterSpacing: roleStyle.letterSpacing,
        textTransform: roleStyle.textTransform,
        textAlign: align,
        width: align === "center" || align === "end" ? "100%" : undefined,
        lineHeight:
          role === "display"
            ? "var(--weave-line-height-tight, 1.1)"
            : "var(--weave-line-height-normal, 1.4)",
      }}
    >
      {text}
    </span>
  );
}
