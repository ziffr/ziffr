// The dump test (spec 0028 step 2, ticket #248): dumps the test database and searches it for the words and numbers the
// database tests wrote down for a sealed Workspace (packages/core/src/workspace-keys-dump.db.test.ts). Any hit fails;
// the control (a name that is not sealed) must be found, or the search itself is broken. Without a needles file (a shard
// that did not run that test) there is nothing to do. The dump is read as a stream and never stored.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const file = process.env.DUMP_NEEDLES_FILE ?? new URL("../../packages/core/.dump-needles.json", import.meta.url).pathname;
if (!existsSync(file)) {
  // CI sets DUMP_REQUIRE: a dump test that did not run must not read as one that passed.
  console.log("No needles file: the dump test did not run in this job.");
  process.exit(process.env.DUMP_REQUIRE ? 1 : 0);
}
const { control, needles } = JSON.parse(readFileSync(file, "utf8"));
const names = process.env.DUMP_DB_CONTAINER
  ? [process.env.DUMP_DB_CONTAINER]
  : execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n").filter(Boolean);
if (names.length !== 1) {
  console.error(`Expected one database container, found ${names.length}: set DUMP_DB_CONTAINER.`);
  process.exit(1);
}

const wanted = [{ text: control, what: "the control" }, ...needles];
const longest = Math.max(...wanted.map((n) => n.text.length));
const found = new Set();
let tail = "";
let bytes = 0;
const dump = spawn("docker", ["exec", names[0], "pg_dump", "-U", "postgres", "-d", "postgres", "--data-only", "--no-owner"], { stdio: ["ignore", "pipe", "ignore"] });
dump.stdout.setEncoding("utf8");
dump.stdout.on("data", (chunk) => {
  bytes += chunk.length;
  const text = tail + chunk;
  for (const n of wanted) if (text.includes(n.text)) found.add(n.text);
  tail = text.slice(-(longest - 1));
});
dump.on("close", (code) => {
  if (code !== 0) {
    console.error(`pg_dump failed (${code}).`);
    process.exit(1);
  }
  if (!found.has(control)) {
    console.error(`The control "${control}" is not in the dump (${bytes} characters read): the search is broken.`);
    process.exit(1);
  }
  const hits = needles.filter((n) => found.has(n.text));
  if (hits.length) {
    console.error("The dump holds data that should be sealed:");
    for (const h of hits) console.error(`  ${h.what}`);
    process.exit(1);
  }
  console.log(`The dump (${bytes} characters) holds none of ${needles.length} sealed words and numbers; the control was found.`);
});
