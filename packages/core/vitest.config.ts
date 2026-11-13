import { defineConfig } from "vitest/config";

// Unit tests of the pure rules; tests against the database (*.db.test.ts) run with vitest.db.config.ts.
export default defineConfig({ test: { globals: true, include: ["src/**/*.test.ts"], exclude: ["src/**/*.db.test.ts", "node_modules/**"] } });
