import { LIMITS, WeaveDocumentError } from "@shepherd-creative/weave-primitives/schemas";

/**
 * The ingress budget for surfaces that hand their raw body to somebody else.
 *
 * `/invoke/:name` reads its own body, so it can weigh the text before parsing
 * it. `/mcp` cannot: it forwards the `Request` to the MCP SDK's transport,
 * which parses the JSON-RPC envelope, validates `params.arguments` against the
 * tool's advertised schema and *strips* whatever that schema does not declare —
 * all before any Weave code runs. The size check that used to be the answer
 * here ran on the **constructed candidate document**, i.e. on what survived
 * that stripping. `render_dashboard` reads only `root`, so a request could
 * carry an arbitrarily large discarded argument and the candidate would be a
 * few hundred bytes: there was no point downstream at which the payload still
 * existed to be refused.
 *
 * So the budget has to be spent at the door, on bytes, before the SDK is
 * involved. It is the same `LIMITS.payloadBytes` REST enforces, so the two HTTP
 * surfaces refuse the same request.
 */

/**
 * Read a request body, refusing it the moment it exceeds `limit` bytes.
 *
 * Streamed rather than buffered-then-measured on purpose: `await req.text()`
 * would materialise the whole body first, which is the cost the limit exists to
 * avoid, and `content-length` is a claim the sender makes rather than a fact
 * (it is absent under chunked encoding and may simply be wrong). Counting
 * actual bytes as they arrive is the only form that cannot be lied to.
 *
 * Returns the exact bytes read, so the caller can rebuild a Request the SDK can
 * consume — the original body stream has been drained by then.
 *
 * @throws {WeaveDocumentError} code `payload`, on the chunk that crosses it
 */
export async function readBoundedBody(
  req: Request,
  limit: number = LIMITS.payloadBytes,
): Promise<Uint8Array | null> {
  if (!req.body) return null;

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        // Stop pulling: nothing past this point can make the request legal.
        await reader.cancel().catch(() => {});
        throw new WeaveDocumentError("payload", `Request payload exceeds the ${limit}-byte limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Re-issue a request with an already-read body.
 *
 * A `Request`'s body can only be consumed once, so weighing it means the
 * downstream handler needs a fresh one carrying the same bytes, method,
 * headers and URL.
 */
export function withBufferedBody(req: Request, body: Uint8Array | null): Request {
  if (body === null) return req;
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body,
    // Required by undici whenever a body is present on a non-GET request.
    duplex: "half",
  } as RequestInit);
}
