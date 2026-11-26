// The phone viewport check (spec 0055; GLOSSARY: Route Tier): a 390 and a 320 wide phone with touch, each light and dark.
// It runs against an app that is already up (CI's core-db job, or yours) with the demo's data:
// `ZIFFR_TEST_URL=http://localhost:3000 pnpm --filter @ziffr/web test:phone`.
import { defineConfig } from "@playwright/test";

const PHONES = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];

export default defineConfig({
  testDir: "./phone",
  outputDir: "./test-results",
  fullyParallel: true,
  workers: process.env.CI ? 3 : 2,
  // A second try covers a server that stumbled once; a page that really breaks a rule breaks it again.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: process.env.ZIFFR_TEST_URL ?? "http://localhost:3000",
    browserName: "chromium",
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: "UTC",
    // Nothing is measured halfway through an animation.
    contextOptions: { reducedMotion: "reduce" },
    screenshot: "only-on-failure",
  },
  projects: PHONES.flatMap((viewport) => (["light", "dark"] as const).map((colorScheme) => ({ name: `phone-${viewport.width}-${colorScheme}`, use: { viewport, colorScheme } }))),
});
