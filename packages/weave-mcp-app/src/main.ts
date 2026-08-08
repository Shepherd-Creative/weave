import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LIMITS } from "@shepherd-creative/weave-primitives/schemas";
import { createBoundedFrameStream } from "./bounded-stdin.js";
import { createServer } from "./server.js";
import { loadDesignSources } from "./theme.js";

// Diagnostics MUST go to stderr: stdout is the JSON-RPC channel in stdio mode.
const { themeCss, guidance, diagnostics } = loadDesignSources(process.env);
for (const d of diagnostics) {
  console.error(`[weave-mcp-app] ${d}`);
}

// Bound the ingress before the SDK frames anything. The transport takes the
// stream to read from, so the budget goes in front of it rather than inside it.
// See bounded-stdin.ts for why a check on the parsed arguments cannot work here.
const stdin = createBoundedFrameStream({
  onOversize: (bytes) =>
    console.error(
      `[weave-mcp-app] discarded a ${bytes}-byte message: over the ${LIMITS.payloadBytes}-byte ingress limit`,
    ),
});
process.stdin.pipe(stdin);

createServer({ themeCss, guidance })
  .connect(new StdioServerTransport(stdin))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
