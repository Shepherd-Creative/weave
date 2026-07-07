import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

/**
 * A design-source adapter run's drop report: what it couldn't carry across
 * the restricted theme-CSS grammar, the judgement calls it made filling
 * contract gaps, and gaps in the contract itself it noticed along the way.
 * Schema, not prose: machine-validated so a malformed report fails the lint
 * gate loudly, and structured so a human reviewer can read the judgement
 * calls in order.
 */
export const DropReportSchema = z.object({
  version: z.literal(1),
  brand: z.string(),
  sources: z.array(z.string()),
  dropped: z.array(
    z.object({
      signal: z.string(),
      reason: z.string(),
      type: z.enum(["non-token-signature", "unsupported-value", "out-of-contract"]),
    }),
  ),
  judgementCalls: z.array(
    z.object({
      id: z.string(),
      decision: z.string(),
      rationale: z.string(),
      affectedTokens: z.array(z.string()),
    }),
  ),
  contractGaps: z.array(
    z.object({
      description: z.string(),
      proposedToken: z.string().optional(),
    }),
  ),
});

export type DropReport = z.infer<typeof DropReportSchema>;

export type DropReportCheck =
  | { status: "missing" }
  | { status: "invalid"; issues: string[] }
  | { status: "valid"; report: DropReport };

function formatIssues(issues: z.ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/** Reads and validates `drop-report.json` at `path`. Never throws. */
export function checkDropReport(path: string): DropReportCheck {
  if (!existsSync(path)) return { status: "missing" };

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    return { status: "invalid", issues: [`could not read file: ${(err as Error).message}`] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { status: "invalid", issues: [`invalid JSON: ${(err as Error).message}`] };
  }

  const result = DropReportSchema.safeParse(parsed);
  if (!result.success) {
    return { status: "invalid", issues: formatIssues(result.error.issues) };
  }
  return { status: "valid", report: result.data };
}
