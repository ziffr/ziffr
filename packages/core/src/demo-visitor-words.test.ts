// The words a visitor writes into what they make (GLOSSARY: Demo Mode; spec 0051, ticket 9), without a database: nothing is
// checked outside a demo visit, and in one every text and word of a widget's settings goes through the text rules.
import { describe, expect, it } from "vitest";
import { DemoReadOnly } from "./demo";
import { runAsVisit } from "./demo-visit-scope";
import { DemoTextRefused, inDemoVisit, visitorOptionalText, visitorSettings, visitorText, visitorThemeSlides, visitorVersionType } from "./demo-visitor-words";
import { DEMO_TEXT_WORDS } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";
import type { ThemeSlides } from "./types";

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const real = { workspaceId: "11111111-1111-4111-8111-111111111111" };
const visit = <T>(work: () => T) => runAsVisit({ "x-ziffr-demo-visit": "1" }, async () => work());

describe("outside a demo visit", () => {
  it("changes nothing: the demo with the setting off, the seed and every real Workspace save what they always saved", async () => {
    expect(inDemoVisit(demo)).toBe(false);
    expect(visitorText(demo, "see www.example.com", "name")).toBe("see www.example.com");
    expect(visitorText(real, "see www.example.com", "name")).toBe("see www.example.com");
    expect(visitorOptionalText(demo, "", "name")).toBe("");
    expect(visitorSettings(demo, { headline: "https://example.com" }).headline).toBe("https://example.com");
    expect(() => visitorVersionType(demo, "metric")).not.toThrow();
  });

  it("is not a visit in a real Workspace, even inside a visit's scope", async () => {
    await visit(() => {
      expect(inDemoVisit(real)).toBe(false);
      expect(visitorText(real, "see www.example.com", "name")).toBe("see www.example.com");
    });
  });
});

describe("in a demo visit", () => {
  it("cleans a name and refuses what the text rules refuse, with their words", async () => {
    await visit(() => {
      expect(inDemoVisit(demo)).toBe(true);
      expect(visitorText(demo, "  Q3 numbers​ ", "name")).toBe("Q3 numbers");
      expect(() => visitorText(demo, "", "name")).toThrow(DEMO_TEXT_WORDS.empty);
      expect(() => visitorText(demo, "x".repeat(81), "name")).toThrow(DEMO_TEXT_WORDS.long);
      expect(() => visitorText(demo, "see www.example.com", "name")).toThrow(DEMO_TEXT_WORDS.link);
      expect(() => visitorText(demo, "<script>", "name")).toThrow(DEMO_TEXT_WORDS.markup);
      expect(() => visitorText(demo, "ok", "name")).not.toThrow(DemoTextRefused);
    });
  });

  it("lets words that are optional stay blank, and checks them when they are there", async () => {
    await visit(() => {
      expect(visitorOptionalText(demo, "", "description")).toBe("");
      expect(visitorOptionalText(demo, "   ", "description")).toBe("   ");
      expect(visitorOptionalText(demo, null, "description")).toBeNull();
      expect(() => visitorOptionalText(demo, "mail me at a@b.com", "description")).toThrow(DEMO_TEXT_WORDS.link);
      expect(visitorOptionalText(demo, "A plain note.", "description")).toBe("A plain note.");
    });
  });

  it("checks every word a visitor can type into a widget: a Finding's, a callout's, a panel's and its notes", async () => {
    await visit(() => {
      const clean = visitorSettings(demo, { headline: " Sales are up ", callouts: [{ period: "2026-03-01", text: "Best month" }] });
      expect(clean.headline).toBe("Sales are up");
      for (const bad of [
        { kicker: "see https://example.com" },
        { footnote: "<b>x</b>" },
        { highlight: "www.example.com" },
        { callouts: [{ period: "2026-03-01", text: "go to example.com/x" }] },
        { panels: [{ type: "line" as const, metricIds: [], title: "www.example.com" }] },
        { panels: [{ type: "line" as const, metricIds: [], refLine: { kind: "constant" as const, label: "https://example.com" } }] },
        { panels: [{ type: "line" as const, metricIds: [], annotations: [{ kind: "note" as const, anchor: { type: "rule" as const, rule: "max" as const }, text: "https://example.com" }] }] },
        { panels: [{ type: "line" as const, metricIds: [], annotations: [{ kind: "ring" as const, anchor: { type: "row" as const, label: "www.example.com" } }] }] },
      ]) expect(() => visitorSettings(demo, bad), JSON.stringify(bad)).toThrow(DemoTextRefused);
    });
  });

  it("takes no free layout: its drawing holds words of every shape", async () => {
    await visit(() => {
      expect(() => visitorSettings(demo, { canvas: { document: { store: {} }, stamp: {} } })).toThrow("free layout");
      expect(() => visitorSettings(demo, { canvas: null })).not.toThrow();
    });
  });

  it("names the Versions a visitor may keep: only of what they may make", async () => {
    await visit(() => {
      for (const ok of ["dashboard", "widget", "theme", "template"]) expect(() => visitorVersionType(demo, ok)).not.toThrow();
      for (const no of ["metric", "workflow", "deck", "snapshot"]) expect(() => visitorVersionType(demo, no)).toThrow(DemoReadOnly);
    });
  });

  it("lets a Theme's footer through as words, and no picture in or out", async () => {
    const slides = (o: Partial<ThemeSlides>): ThemeSlides => ({ background_image: null, logo: null, logo_ratio: 3, logo_position: "top-right", logo_width: 140, footer: "", show_slide_number: false, title_size: 56, body_size: 24, ...o });
    await visit(() => {
      expect(visitorThemeSlides(demo, slides({ footer: " Our numbers " }), slides({})).footer).toBe("Our numbers");
      expect(() => visitorThemeSlides(demo, slides({ footer: "www.example.com" }), slides({}))).toThrow(DEMO_TEXT_WORDS.link);
      expect(() => visitorThemeSlides(demo, slides({ logo: "data:image/png;base64,AAAA" }), slides({}))).toThrow("Pictures");
      expect(() => visitorThemeSlides(demo, slides({ background_image: "data:image/png;base64,AAAA" }), slides({}))).toThrow("Pictures");
      // What the Theme already has is not a new picture.
      expect(() => visitorThemeSlides(demo, slides({ logo: "data:image/png;base64,AAAA" }), slides({ logo: "data:image/png;base64,AAAA" }))).not.toThrow();
    });
  });
});
