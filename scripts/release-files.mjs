#!/usr/bin/env node
// The Docker files a release attaches (spec 0015, ADR 0014): docker/compose.yml and docker/install.sh with the
// release's version written in, so `releases/latest/download/compose.yml` starts exactly that image. The copies on
// main name a placeholder and are never changed by a release. Usage: node scripts/release-files.mjs 0.12.0 <folder>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { setDockerVersion } from "./release-lib.mjs";

const [version, out] = process.argv.slice(2);
if (!out) throw new Error("Give the version and the folder to write to.");
mkdirSync(out, { recursive: true });
for (const file of ["docker/compose.yml", "docker/install.sh"]) {
  writeFileSync(join(out, basename(file)), setDockerVersion(readFileSync(file, "utf8"), version), { mode: 0o644 });
}
