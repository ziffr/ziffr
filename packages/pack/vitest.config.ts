import { defineConfig } from "vitest/config";

// The Pack kit's tests: the format's checks and the command, with nothing running.
export default defineConfig({ test: { globals: true, include: ["src/**/*.test.ts"], passWithNoTests: true } });
