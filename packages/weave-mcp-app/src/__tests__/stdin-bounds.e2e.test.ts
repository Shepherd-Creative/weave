import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "node:path";
import { LIMITS } from "@shepherd-creative/weave-primitives/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The stdio ingress budget, end to end against the shipped bundle.
 *
 * Driven with raw JSON-RPC rather than the SDK client on purpose: the point is
 * what the server does with a message it must NEVER parse, and an SDK client
 * would only ever tell us that its request timed out.
 */

const DIST = path.resolve(__dirname, "../../dist/index.js");

type Rpc = Record<string, unknown>;

class RawStdioClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private readonly responses = new Map<number, Rpc>();
  stderr = "";

  constructor() {
    this.child = spawn(process.execPath, [DIST, "--stdio"], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      let nl = this.buffer.indexOf("\n");
      while (nl !== -1) {
        const line = this.buffer.slice(0, nl);
        this.buffer = this.buffer.slice(nl + 1);
        if (line.trim()) {
          const message = JSON.parse(line) as Rpc;
          if (typeof message.id === "number") this.responses.set(message.id, message);
        }
        nl = this.buffer.indexOf("\n");
      }
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
  }

  send(message: Rpc | string): void {
    this.child.stdin.write(typeof message === "string" ? message : `${JSON.stringify(message)}\n`);
  }

  /** Resolve when a response with this id arrives, or null once `timeoutMs` passes. */
  async awaitResponse(id: number, timeoutMs = 5_000): Promise<Rpc | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hit = this.responses.get(id);
      if (hit) return hit;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return null;
  }

  async initialize(): Promise<void> {
    this.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "weave-ingress-e2e", version: "0.0.0" },
      },
    });
    const ready = await this.awaitResponse(1, 20_000);
    if (!ready) throw new Error("HARNESS BUG: the stdio server never answered initialize");
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  kill(): void {
    this.child.kill();
  }
}

describe("weave-mcp-app stdio ingress budget", () => {
  const client = new RawStdioClient();

  beforeAll(async () => {
    await client.initialize();
  }, 25_000);
  afterAll(() => {
    client.kill();
  });

  it("answers an ordinary request (harness control)", async () => {
    // Without this, every assertion below would also pass against a server that
    // had simply died on startup.
    client.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const response = await client.awaitResponse(2);
    expect(response?.result).toBeDefined();
  });

  it("never answers a message larger than the ingress budget", async () => {
    // `render_dashboard` reads only `root`, so `junk` is discarded before any
    // Weave check could see it. Nothing but bounded framing can refuse this.
    client.send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "render_dashboard",
        arguments: {
          root: { type: "NoteCard", body: "ok" },
          junk: "x".repeat(LIMITS.payloadBytes),
        },
      },
    });
    expect(await client.awaitResponse(3, 2_000)).toBeNull();
  });

  it("says on stderr what it discarded", async () => {
    expect(client.stderr).toMatch(/discard/i);
    expect(client.stderr).toContain(String(LIMITS.payloadBytes));
  });

  it("resyncs: the request after an oversized one is answered normally", async () => {
    // The failure mode a naive size check would produce is far worse than the
    // one it fixes — a half-forwarded frame corrupts the NEXT message.
    client.send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "render_note_card", arguments: { body: "still here" } },
    });
    const response = await client.awaitResponse(4);
    const result = response?.result as { structuredContent?: { document?: { root?: Rpc } } };
    expect(result?.structuredContent?.document?.root?.type).toBe("NoteCard");
  });
});
