import type { NumberSpec } from "../schemas/atoms.js";
import { formatNumber } from "../utils/format.js";
import { numberFontSize } from "../utils/style.js";
import { toneToColorVar } from "../utils/theme.js";

export function Number(props: Omit<NumberSpec, "type">): React.JSX.Element {
  const { value, format, precision, currency, locale, size, tone, showSign } = props;
  const text = formatNumber(value, { format, precision, currency, locale, showSign });
  return (
    <span
      style={{
        color: toneToColorVar(tone),
        fontSize: numberFontSize(size),
        fontWeight: size === "xl" || size === "lg" ? 700 : 500,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.1,
        fontFamily: "var(--font-display)",
      }}
    >
      {text}
    </span>
  );
}
