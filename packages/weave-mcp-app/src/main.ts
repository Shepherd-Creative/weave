import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { loadDesignSources } from "./theme.js";

// Diagnostics MUST go to stderr: stdout is the JSON-RPC channel in stdio mode.
const { themeCss, guidance, diagnostics } = loadDesignSources(process.env);
for (const d of diagnostics) {
  console.error(`[weave-mcp-app] ${d}`);
}

createServer({ themeCss, guidance })
  .connect(new StdioServerTransport())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
