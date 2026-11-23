// @ts-nocheck
// A file of the repository outside the core, such as a published schema or the Calculation Catalogue, for tests.
// Found from the repository's root (the folder with pnpm-workspace.yaml) upward from this file, so a test reads the same
// file when Stryker runs it from a copy of the core in packages/core/.stryker-tmp (spec 0022, mutation testing).
import { existsSync } from "node:fs";

/** The URL of `path`, relative to the repository's root. */
export function repoFile(path: string): URL {
  for (let dir = new URL("./", import.meta.url); dir.pathname !== "/"; dir = new URL("../", dir)) {
    if (existsSync(new URL("pnpm-workspace.yaml", dir))) return new URL(path, dir);
  }
  throw new Error(`No repository root above ${import.meta.url}`);
}
