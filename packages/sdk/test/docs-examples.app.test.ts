// The code examples in the guides and READMEs marked `run`, run against the running app (ticket #571, part 3): curl
// lines as they are written (only the address is the test app's), TypeScript through the SDK's source. A wrong
// example fails here, so the docs cannot say what the API does not do. Which blocks there are, and that each is marked,
// is in docs-blocks.test.ts.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { allBlocks } from "./docs-blocks";

const URL = process.env.ZIFFR_TEST_URL ?? "http://localhost:3000";
/** The addresses the docs use for "your Ziffr". */
const DOC_HOSTS = ["https://your-ziffr.example", "https://ziffr.example.com"];
const inTest = (code: string) => DOC_HOSTS.reduce((c, h) => c.split(h).join(URL), code);
const blocks = allBlocks().filter((b) => b.mode === "run");

let cleanup: () => Promise<void>;
let secret = "";
let bin = "";

beforeAll(async () => {
  // What the examples talk about: Orders (the key's creator submits to it, values add up) and Revenue (monthly, the
  // key's creator owns it), and a key with the scopes the examples need.
  const w = await workspace(); cleanup = w.cleanup;
  const ben = await w.person("member");
  const orders = await w.metric(ben, { name: "Orders", slug: "orders", submission_rule: "add" }); await w.token(orders.id, ben);
  await w.metric(ben, { name: "Revenue", slug: "revenue" });
  secret = (await createAccessKey(w.actor(ben, "member"), { name: "Docs examples", scopes: ["metrics:read", "values:submit", "metrics:write", "metrics:edit"], expiresOn: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) })).secret;
  // A `curl` that fails on an HTTP error, so an example the API refuses fails the test (the docs' lines have no -f).
  bin = mkdtempSync(join(tmpdir(), "docs-examples-"));
  const real = execFileSync("sh", ["-c", "command -v curl"]).toString().trim();
  writeFileSync(join(bin, "curl"), `#!/bin/sh\nexec ${real} --fail-with-body -sS "$@"\n`);
  chmodSync(join(bin, "curl"), 0o755);
});
afterAll(async () => { rmSync(bin, { recursive: true, force: true }); await cleanup?.(); });

describe("the examples in the docs against the app", () => {
  it("there are examples to run", () => { expect(blocks.length).toBeGreaterThanOrEqual(5); });
  it.each(blocks.map((b) => [`${b.file}:${b.line}`, b] as const))("%s runs", async (_name, b) => {
    const env = { ...process.env, ZIFFR_ACCESS_KEY: secret, PATH: `${bin}:${process.env.PATH}` };
    if (b.lang === "sh") {
      execFileSync("sh", ["-ec", inTest(b.code)], { env, stdio: "pipe" });
      return;
    }
    // TypeScript and JavaScript: through the SDK's source rather than the published package.
    const file = new globalThis.URL(`./.example-${b.line}.ts`, import.meta.url);
    writeFileSync(file, inTest(b.code).replace(/"@ziffr\/sdk"/g, '"../src/index"'));
    Object.assign(process.env, { ZIFFR_ACCESS_KEY: secret });
    try { await import(/* @vite-ignore */ file.pathname); } finally { rmSync(file, { force: true }); }
  });
});
