// GLOSSARY: Widget, Present. A Widget's ⋯ menu, its panels and its dialogs open in a portal on the page. Present (a
// dashboard opened large, a deck's slideshow) covers the page at the modal level, so a popup at a lower level opened
// UNDER it and the ⋯ did "nothing" (the report: the menu works small, not in the enlarged Widget). jsdom does no layout,
// so this guards the rule at its source: every popup layer sits above the modal level, below toasts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(src, p), "utf8");
const level = (css: string, name: string) => Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(css)?.[1]);

describe("popup stacking", () => {
  const css = read("app/tokens.css");
  it("popups sit above the modal level that Present and the slideshow use, and below toasts", () => {
    expect(level(css, "popup")).toBeGreaterThan(level(css, "modal"));
    expect(level(css, "popup")).toBeLessThan(level(css, "toast"));
  });
  it.each(["dropdown-menu", "context-menu", "popover", "select", "dialog", "sheet"])("%s uses the popup level, not a fixed 50", (name) => {
    const code = read(`components/ui/${name}.tsx`);
    expect(code).toContain("z-[var(--z-popup)]");
    expect(code).not.toMatch(/\bz-50\b/);
  });
  it("the modal layers are the ones the popups must clear", () => {
    expect(read("components/present-dashboard.tsx")).toContain("z-[var(--z-modal)]");
    expect(read("decks/slideshow.tsx")).toContain("z-[var(--z-modal)]");
  });
});
