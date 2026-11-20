// The small page of an unsubscribe link (spec 0004 #74, spec 0031 #368): static HTML under a strict policy, no
// script, never cached, that names no person, Workspace or Metric, so whoever holds a link learns nothing from it.

/** A page with a title and a body, with the headers an unsubscribe page needs. */
export const unsubscribePage = (title: string, body: string, status = 200) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`
  + `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}button{font:inherit;padding:.5rem 1rem}</style></head>`
  + `<body><h1>${title}</h1>${body}</body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } },
);
