---
"@ziffr/web": minor
"@ziffr/sdk": minor
---

Developers: `@ziffr/sdk`, an MIT-licensed TypeScript client for the API. It has typed calls for every endpoint, iterates over pages for you, waits out a 429 as `Retry-After` says, and sends an idempotency key with every submission so a retry never records a value twice. See `packages/sdk/README.md`.
