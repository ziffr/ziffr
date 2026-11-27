// @vitest-environment node
// Home's start screen and the line on the example dashboard as a person sees them (#1292; GLOSSARY: Home dashboard, Test
// Metric): only the choices the core allows, and words that say what Remove does before it is pressed.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {} }) }));
vi.mock("sonner", () => ({ toast: { success() {}, error() {} } }));
vi.mock("@/app/home-actions", () => ({ tryExample: async () => ({}), removeExample: async () => ({}) }));
import type { StartChoices } from "@ziffr/core/trial-example";
import { StartScreen } from "./start-screen";
import { ExampleNote, removeWords } from "./example-note";

const all: StartChoices = { pack: true, example: true, setup: { done: 1, total: 5 }, askColleague: false };
const start = (over: Partial<StartChoices> = {}) => renderToStaticMarkup(<StartScreen choices={{ ...all, ...over }} />);

describe("Where would you like to start?", () => {
  it("offers a trial's Owner all four choices", () => {
    const h = start();
    for (const words of ["Where would you like to start?", "Create your first figure", "Install a Pack", "Try the example", "Continue setup (1 of 5)", "Ziffr asks you once a day how many cups of coffee you drank, so you see how it works."]) expect(h).toContain(words);
    expect(h).toContain('href="/metrics/new"');
    expect(h).toContain('href="/settings/packs"');
    expect(h).toContain('href="/setup"');
    expect(h).not.toContain("ask a colleague");
  });
  it("offers nothing a person cannot use", () => {
    const h = start({ pack: false, example: false, setup: null, askColleague: true });
    expect(h).toContain("Create your first figure");
    for (const words of ["Install a Pack", "Try the example", "Continue setup", "coffee"]) expect(h).not.toContain(words);
    expect(h).toContain("ask a colleague to share a dashboard with you");
  });
});

describe("the line on the example dashboard", () => {
  const note = (remove: { hasValues: boolean } | null) => renderToStaticMarkup(<ExampleNote dashboardId={1} note={{ metricName: "Cups of coffee", remove }} />);
  it("says what the dashboard is, with Remove only for who may", () => {
    expect(note(null)).toContain("This is an example.");
    expect(note(null)).not.toContain("<button");
    expect(note({ hasValues: false })).toContain(">Remove<");
  });
  it("says before removing whether recorded values stay", () => {
    expect(removeWords("Cups of coffee", false)).toContain("No value was recorded");
    expect(removeWords("Cups of coffee", true)).toContain("it and its values are kept");
  });
});
