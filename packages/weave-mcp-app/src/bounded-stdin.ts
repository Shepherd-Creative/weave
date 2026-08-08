import { Transform } from "node:stream";
import { LIMITS } from "@shepherd-creative/weave-primitives/schemas";

/**
 * The stdio equivalent of the HTTP ingress budget.
 *
 * Over HTTP a request has a body you can weigh before handing it on. Over stdio
 * there is no such object: the MCP SDK's `ReadBuffer` accumulates whatever
 * arrives on stdin until it meets a newline, then parses that line as a
 * JSON-RPC message. So an arbitrarily large message is materialised as objects
 * before any Weave code runs — and by the time `invokeTool` sees the arguments,
 * the SDK has already dropped everything the tool's schema did not declare.
 * `render_dashboard` reads only `root`, so a message could carry a megabyte of
 * discarded argument and leave a few hundred bytes of candidate document
 * behind: nothing downstream still held the evidence to refuse it.
 *
 * The fix is to bound the FRAMING rather than the parsing. This stream sits
 * between `process.stdin` and the transport and forwards only whole frames
 * within the budget.
 *
 * ## Semantics
 *
 * - A **frame** is the bytes up to (not including) a newline. The limit and the
 *   reported size both refer to those bytes.
 * - A frame within the limit is forwarded **byte for byte**, newline included.
 * - A frame over the limit is **discarded whole**, and the stream resyncs at the
 *   next newline. It is never truncated: a half-forwarded frame would merge
 *   with the following message and corrupt a request the caller sent correctly,
 *   which is a worse failure than the one being fixed.
 * - Memory is bounded by the limit: once a frame crosses it, the bytes held for
 *   it are released and subsequent bytes are counted but not kept.
 * - A discarded frame gets **no JSON-RPC reply**. There is nothing honest to
 *   reply to — the message was never framed, so its `id` was never read, and an
 *   `id: null` error would only surface on the client as an unmatched response.
 *   The caller sees its request time out; the operator sees the reason on
 *   stderr. This is the documented cost of the guard.
 */

const NEWLINE = 0x0a;

export type BoundedFrameOptions = {
  /** Max bytes in one frame. Defaults to the budget every other surface uses. */
  limit?: number;
  /** Called once per discarded frame, with its size in bytes. */
  onOversize?: (bytes: number) => void;
};

export function createBoundedFrameStream(options: BoundedFrameOptions = {}): Transform {
  const limit = options.limit ?? LIMITS.payloadBytes;
  const { onOversize } = options;

  /** Bytes of the current frame — held only while it is still within budget. */
  let held: Buffer[] = [];
  let frameBytes = 0;
  let dropping = false;

  return new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      let rest = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      while (rest.length > 0) {
        const newlineAt = rest.indexOf(NEWLINE);
        const content = newlineAt === -1 ? rest : rest.subarray(0, newlineAt);

        frameBytes += content.length;
        if (!dropping && frameBytes > limit) {
          dropping = true;
          held = []; // release what was held; none of this frame will be sent
        }
        if (!dropping) held.push(content);

        if (newlineAt === -1) break; // frame continues in a later chunk

        if (dropping) {
          onOversize?.(frameBytes);
        } else {
          for (const part of held) this.push(part);
          this.push(rest.subarray(newlineAt, newlineAt + 1));
        }

        held = [];
        frameBytes = 0;
        dropping = false;
        rest = rest.subarray(newlineAt + 1);
      }

      callback();
    },
  });
}
