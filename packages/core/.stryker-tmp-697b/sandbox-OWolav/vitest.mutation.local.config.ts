// @ts-nocheck
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// A local run of Stryker on the what-if files: only the tests that cover them (not committed).
export default mergeConfig(base, defineConfig({ test: { include: ["src/methods/what-if.test.ts", "src/takeaways/what-if-takeaway.test.ts", "src/takeaways/takeaway.test.ts", "src/formula.test.ts"] } }));
