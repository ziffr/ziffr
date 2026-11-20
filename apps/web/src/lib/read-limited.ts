// Reading a request body without ever holding more than a limit (GLOSSARY: Webhook; used by the routes that take
// signed requests from outside: inbound email and a Webhook's status back). Security: a declared length that is not a
// plain number or is too large is refused before anything is read, and an endless or lying body is cut at the limit.

/** The body, read until it passes `max` bytes (then null), so a large or endless body is never held whole. */
export async function readLimited(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d{1,10}$/.test(declared) || Number(declared) > max)) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { body.set(p, at); at += p.byteLength; }
  return body;
}
