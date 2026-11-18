// A request body read with a ceiling (spec 0023; docs/security/threat-model.md): public endpoints such as /mcp and
// the OAuth routes take bodies from anyone, so a body is never buffered whole before its size is known. A declared
// Content-Length over the ceiling is refused at once; otherwise the stream is read counting bytes and cancelled as
// soon as it passes the ceiling, chunked bodies included.

/** The body as text, or null when it is larger than `max` bytes. */
export async function readLimited(req: Request, max: number): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}
