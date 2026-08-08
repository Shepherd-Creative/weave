import { LIMITS } from "@shepherd-creative/weave-primitives/schemas";
import { describe, expect, it } from "vitest";
import { createBoundedFrameStream } from "../bounded-stdin.js";

/**
 * The stdio equivalent of the HTTP ingress budget.
 *
 * Over stdio there is no request body to weigh: the SDK's `ReadBuffer` simply
 * accumulates whatever arrives until it finds a newline, then parses it. So an
 * arbitrarily large JSON-RPC message is materialised as objects before any
 * Weave code runs, and a tool that discards most of its arguments (
 * `render_dashboard` reads only `root`) leaves nothing downstream that could
 * ever refuse it. The cure is to bound the FRAMING: buffer at most one
 * message's worth of bytes, and never forward a frame bigger than the limit.
 */

/** Drain a stream to a string, so assertions are about what the SDK would see. */
const drain = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
};

const frame = (value: unknown) => `${JSON.stringify(value)}\n`;

describe("harness sanity", () => {
  it("imported the thing it is about to test", () => {
    expect(typeof createBoundedFrameStream).toBe("function");
    expect(typeof LIMITS.payloadBytes).toBe("number");
  });
});

describe("bounded stdio framing", () => {
  it("forwards ordinary frames byte for byte", async () => {
    const stream = createBoundedFrameStream({ limit: 1_000 });
    const input = frame({ jsonrpc: "2.0", id: 1, method: "ping" }) + frame({ jsonrpc: "2.0" });
    stream.end(input);
    expect(await drain(stream)).toBe(input);
  });

  it("reassembles a frame split across chunks", async () => {
    const stream = createBoundedFrameStream({ limit: 1_000 });
    const input = frame({ jsonrpc: "2.0", id: 1, method: "ping" });
    stream.write(input.slice(0, 7));
    stream.write(input.slice(7, 20));
    stream.end(input.slice(20));
    expect(await drain(stream)).toBe(input);
  });

  it("drops an oversized frame entirely rather than truncating it", async () => {
    // Truncating would be worse than useless: a partial frame merges with the
    // next one and corrupts a message the caller did nothing wrong to send.
    const stream = createBoundedFrameStream({ limit: 100 });
    const good = frame({ jsonrpc: "2.0", id: 2, method: "ping" });
    stream.end(frame({ junk: "x".repeat(500) }) + good);
    expect(await drain(stream)).toBe(good);
  });

  it("resyncs on the next newline when the oversized frame spans chunks", async () => {
    const stream = createBoundedFrameStream({ limit: 100 });
    const good = frame({ jsonrpc: "2.0", id: 3, method: "ping" });
    stream.write(`{"junk":"${"x".repeat(400)}`);
    stream.write(`${"y".repeat(400)}"}\n`);
    stream.end(good);
    expect(await drain(stream)).toBe(good);
  });

  it("reports each discarded frame once, with its size", async () => {
    const discarded: number[] = [];
    const stream = createBoundedFrameStream({
      limit: 100,
      onOversize: (bytes) => discarded.push(bytes),
    });
    stream.end(
      frame({ junk: "x".repeat(500) }) +
        frame({ jsonrpc: "2.0", id: 4 }) +
        frame({ junk: "y".repeat(500) }),
    );
    await drain(stream);
    expect(discarded).toHaveLength(2);
    for (const bytes of discarded) expect(bytes).toBeGreaterThan(100);
  });

  it("accepts a frame exactly at the limit and refuses the next byte", async () => {
    // Off-by-one matters here: the limit is what a legal message may weigh.
    const body = (n: number) => `${"x".repeat(n)}\n`;
    const atLimit = createBoundedFrameStream({ limit: 50 });
    atLimit.end(body(50));
    expect((await drain(atLimit)).length).toBe(51);

    const overLimit = createBoundedFrameStream({ limit: 50 });
    overLimit.end(body(51));
    expect(await drain(overLimit)).toBe("");
  });

  it("stays in discard mode for the whole of an endless frame", async () => {
    // 200 KB arriving with no newline in sight. Nothing is forwarded, and the
    // frame is reported once at its true size — the stream tracked it without
    // ever holding more than the limit.
    const discarded: number[] = [];
    const stream = createBoundedFrameStream({
      limit: 1_000,
      onOversize: (bytes) => discarded.push(bytes),
    });
    for (let i = 0; i < 200; i++) stream.write("z".repeat(1_000));
    stream.end("\n");
    expect(await drain(stream)).toBe("");
    expect(discarded).toEqual([200_000]);
  });

  it("defaults to the shared payload budget", async () => {
    // The stdio limit is the same number REST and /mcp enforce, so the four
    // surfaces refuse the same message.
    const stream = createBoundedFrameStream({});
    stream.end(`{"junk":"${"x".repeat(LIMITS.payloadBytes)}"}\n`);
    expect(await drain(stream)).toBe("");
  });
});
