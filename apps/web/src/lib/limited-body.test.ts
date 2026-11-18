// readLimited (spec 0023): a public endpoint never buffers a body whole before knowing its size.
import { describe, expect, it } from "vitest";
import { readLimited } from "./limited-body";

/** A chunked body of `chunks` pieces of `size` bytes, without a Content-Length, that counts how much was pulled. */
function chunked(chunks: number, size: number) {
  const state = { pulled: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(c) { if (state.pulled >= chunks) return c.close(); state.pulled++; c.enqueue(new Uint8Array(size).fill(120)); },
    cancel() { state.cancelled = true; },
  });
  return { req: new Request("http://ziffr.test/mcp", { method: "POST", body, duplex: "half" } as RequestInit), state };
}

describe("readLimited", () => {
  it("reads a body within the limit, counting bytes rather than characters", async () => {
    expect(await readLimited(new Request("http://ziffr.test", { method: "POST", body: "{\"a\":1}" }), 100)).toBe("{\"a\":1}");
    // Four characters of two bytes each: eight bytes, over a limit of six.
    expect(await readLimited(new Request("http://ziffr.test", { method: "POST", body: "éééé" }), 6)).toBeNull();
    expect(await readLimited(new Request("http://ziffr.test", { method: "GET" }), 10)).toBe("");
  });
  it("refuses a declared length over the limit without reading", async () => {
    const { req, state } = chunked(10, 10);
    req.headers.set("content-length", "1000000");
    expect(await readLimited(req, 50)).toBeNull();
    expect(state.pulled).toBeLessThanOrEqual(1);
    const odd = chunked(1, 1).req;
    odd.headers.set("content-length", "12abc");
    expect(await readLimited(odd, 50)).toBeNull();
  });
  it("stops a chunked body as soon as it passes the limit", async () => {
    const { req, state } = chunked(1000, 1024);
    expect(await readLimited(req, 4096)).toBeNull();
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(10);
  });
});
