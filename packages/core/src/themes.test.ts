import { describe, expect, it } from "vitest";
import { isDark, slideDesign, themeFor, themeVars } from "./themes";
import type { Theme, ThemeTokens } from "./types";

const tokens: ThemeTokens = {
  canvas: "#F0EBE7", surface: "#FDFBF8", ink: "#221B19", muted: "#615955", rule: "#D9D3CF", accent: "#BB3D31",
  data: ["#312926"], good: "#21763C", bad: "#BE2323", band: "#E8E1DD",
  fontHeading: "general-sans", fontBody: "general-sans", fontFigures: "geist-mono", radius: 8, cards: "paper",
};
const slides = { background_image: null, logo: null, logo_ratio: 3, logo_position: "top-right" as const, logo_width: 140, footer: "Northwind", show_slide_number: true, title_size: 56, body_size: 24 };
const coral: Theme = { id: 1, owner_id: "sara", name: "Coral", tokens, slides, is_default: true, updated_at: "" };
const night: Theme = { ...coral, id: 2, name: "Night", is_default: false, tokens: { ...tokens, surface: "#171A21", ink: "#F1F3F7" } };

describe("themes", () => {
  it("uses a dashboard's own theme, else the team default", () => {
    expect(themeFor([coral, night], 2)?.name).toBe("Night");
    expect(themeFor([coral, night], null)?.name).toBe("Coral");
    expect(themeFor([coral, night], 99)?.name).toBe("Coral");
  });
  it("draws slides in the theme's colours, with the deck's own footer if it has one", () => {
    expect(slideDesign(coral, "Board only")).toMatchObject({ footer: "Board only", background_color: "#FDFBF8", text_color: "#221B19" });
    expect(slideDesign(coral)?.footer).toBe("Northwind");
  });
  it("knows dark from light and sets the content's tokens", () => {
    expect(isDark(night.tokens)).toBe(true);
    expect(isDark(tokens)).toBe(false);
    expect(themeVars(tokens)["--color-accent-2"]).toBe("#BB3D31");
  });
});
