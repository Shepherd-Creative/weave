import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read the SKILL.md content bundled with this package.
 *
 * This is an offline authoring method, not a runtime dependency: an agent
 * harness loads it into a skill slot (or a system prompt) so the model can
 * turn a brand's design source into a validated Weave theme. Cache the
 * result; file changes require a reload.
 *
 * Node-only. Not bundled for browser targets.
 */
export function loadSkill(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // dist/index.js sits at packages/weave-adapter-skill/dist/index.js after
  // build, and src/loadSkill.ts sits at packages/weave-adapter-skill/src/
  // loadSkill.ts in dev. Both resolve SKILL.md via `../SKILL.md`.
  const packageRoot = join(dirname(thisFile), "..");
  return readFileSync(join(packageRoot, "SKILL.md"), "utf8");
}

/** Returns the absolute path to the bundled SKILL.md. */
export function skillPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = join(dirname(thisFile), "..");
  return join(packageRoot, "SKILL.md");
}
