import { defineConfig } from "vitest/config";

// Core operations against a real Postgres with the migrations applied (spec 0001, testing decisions). Needs local
// Supabase running (`supabase start`); the address and key come from `supabase status` unless already set.
export default defineConfig({ test: { globals: true, include: ["src/**/*.db.test.ts"], setupFiles: ["src/test/db-env.ts"], fileParallelism: false, testTimeout: 30_000 } });
