// Writes the API's OpenAPI document to generated/openapi.json for the API reference, from the same function the
// app serves it from (apps/web/src/app/api/v1/openapi.ts), so the reference can never differ from the API.
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "../../web");
const server = await createServer({ root: web, configFile: false, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
try {
  const { openApiDocument } = await server.ssrLoadModule(resolve(web, "src/app/api/v1/openapi.ts"));
  mkdirSync(resolve(here, "../generated"), { recursive: true });
  writeFileSync(resolve(here, "../generated/openapi.json"), JSON.stringify(openApiDocument(), null, 2));
} finally {
  await server.close();
}
