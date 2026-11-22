import { defineConfig } from "vitest/config";

// The Extension Kit's tests: the shape and static checks on the good example and on every bad Extension, with nothing run.
export default defineConfig({ test: { globals: true, include: ["src/**/*.test.ts"] } });
