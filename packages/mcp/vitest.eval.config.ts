import { defineConfig } from "vitest/config";
import "../core/src/test/serial-files";

// The MCP scenario evals (ticket #614): a real model against the MCP server and the running app, so slow, billed and
// no part of `pnpm test`. Test data is made through the core, like the database tests.
export default defineConfig({ test: { globals: true, include: ["evals/**/*.eval.ts"], setupFiles: ["../core/src/test/db-env.ts"], fileParallelism: false, testTimeout: 20 * 60_000 } });
