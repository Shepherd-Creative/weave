import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read the SKILL.md content bundled with this package.
 *
 * Host apps typically call this at server startup and concatenate the
 * result into the agent's system prompt. Cache the result — file changes
 * require a server restart.
 *
 * Node-only. Not bundled for browser targets.
 *
 * @param variant "skill" (default) returns SKILL.md; "notes" returns NOTES.md (design notes, not shipped to the LLM).
 */
export function loadSkill(variant: "skill" | "notes" = "skill"): string {
  const thisFile = fileURLToPath(import.meta.url);
  // dist/index.js sits at packages/weave-skill/dist/index.js after build,
  // and src/loadSkill.ts sits at packages/weave-skill/src/loadSkill.ts in dev.
  // Both resolve SKILL.md via `../{filename}`.
  const packageRoot = join(dirname(thisFile), "..");
  const fileName = variant === "notes" ? "NOTES.md" : "SKILL.md";
  return readFileSync(join(packageRoot, fileName), "utf8");
}

/**
 * Returns the absolute path to the bundled SKILL.md / NOTES.md.
 */
export function skillPath(variant: "skill" | "notes" = "skill"): string {
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = join(dirname(thisFile), "..");
  return join(packageRoot, variant === "notes" ? "NOTES.md" : "SKILL.md");
}
