import type { NumberFormat } from "../schemas/tokens.js";

/**
 * Format a number using `Intl.NumberFormat` with Weave's semantic format tokens.
 */
export function formatNumber(
  value: number,
  opts: {
    format?: NumberFormat;
    precision?: number;
    currency?: string;
    locale?: string;
    showSign?: boolean;
  } = {},
): string {
  const { format, precision, currency, locale, showSign } = opts;
  const options: Intl.NumberFormatOptions = {
    signDisplay: showSign ? "exceptZero" : "auto",
  };

  switch (format) {
    case "int":
      options.maximumFractionDigits = 0;
      options.minimumFractionDigits = 0;
      break;
    case "currency":
      options.style = "currency";
      options.currency = currency ?? "USD";
      if (precision !== undefined) {
        options.minimumFractionDigits = precision;
        options.maximumFractionDigits = precision;
      }
      break;
    case "percent":
      options.style = "percent";
      if (precision !== undefined) {
        options.minimumFractionDigits = precision;
        options.maximumFractionDigits = precision;
      } else {
        options.maximumFractionDigits = 1;
      }
      break;
    case "compact":
      options.notation = "compact";
      options.maximumFractionDigits = precision ?? 1;
      break;
    case "decimal":
    default:
      if (precision !== undefined) {
        options.minimumFractionDigits = precision;
        options.maximumFractionDigits = precision;
      }
      break;
  }

  return new Intl.NumberFormat(locale, options).format(value);
}
