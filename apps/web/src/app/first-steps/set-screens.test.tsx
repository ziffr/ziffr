// @vitest-environment node
// First Steps' two ready-made set screens as a person sees them (spec 0067, ticket 2; GLOSSARY: First Steps, Pack,
// Sample Data): three sets first with why they fit, the rest on request, one set with its example dashboard and the way
// into its guided set-up, whose address names the Pack the flow reads back.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ unstable_rethrow() {}, useSearchParams: () => new URLSearchParams(), usePathname: () => "/first-steps" }));
vi.mock("./actions", () => ({ readSet: async () => ({}), readSets: async () => ({}) }));
vi.mock("@/app/pack-actions", () => ({}));
import { PackPreviewView } from "@/app/settings/packs/preview-view";
import { packRefOf, packSetUpPath } from "@/app/use-pack/switch";
import { SlideOverProvider } from "@/components/slide-over-host";
import { bundledPacks, INCLUDED_PACK_ORDER } from "@ziffr/core/included-packs";
import { DEFAULT_NUMBER_STYLE } from "@ziffr/core/number-style";
import type { PackPreview } from "@ziffr/core/packs";
import { keptOverview } from "@ziffr/pack/comes-from";
import { OneSetView } from "./screens/set";
import { SetList } from "./screens/sets";

const none = () => {};
const clean = (h: string) => h.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("<!-- -->", "");
// The Preview opens inside the app's frame, which holds the side panel it shares with the Packs page.
const framed = (node: React.ReactNode) => clean(renderToStaticMarkup(<SlideOverProvider>{node}</SlideOverProvider>));
const buttons = (h: string) => [...h.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));

const sets = ["Online shop", "Sales", "Finance", "People"].map((name, i) => ({ id: `ziffr/set-${i}`, name, summary: `About ${name}.`, metrics: i + 1, match: i === 0 ? "Matches your business and role" : null }));
const list = (all: boolean, of = sets) => clean(renderToStaticMarkup(<SetList data={{ alone: false, sets: of }} all={all} onShowAll={none} onOpen={none} />));

describe("Choose a ready-made set", () => {
  it("shows the three best, why one fits, and offers the rest", () => {
    const h = list(false);
    expect(h).toContain("Online shop");
    expect(h).toContain("About Online shop.");
    expect(h).toContain("1 metric<");
    expect(h).toContain("3 metrics");
    expect(h).toContain("Matches your business and role");
    expect(h).not.toContain("About People.");
    expect(buttons(h).at(-1)).toBe("Show all 4 sets");
  });
  it("shows every set once asked, and offers nothing more when there are no more", () => {
    expect(list(true)).toContain("About People.");
    expect(list(true)).not.toContain("Show all");
    expect(list(false, sets.slice(0, 1))).not.toContain("Show all");
  });
  it("says so when there is nothing to choose", () => {
    expect(list(false, [])).toContain("There is no ready-made set to choose here.");
  });
});

const preview: PackPreview = {
  manifest: { format: "ziffr.pack/3", id: "ziffr/sales", version: "1.0.0", name: "Sales", summary: "Sales numbers.", license: "MIT", author: { name: "Ziffr" } } as PackPreview["manifest"],
  items: [
    ...["One", "Two", "Three", "Four", "Five", "Six", "Seven"].map((name, i) => ({ kind: "metric" as const, key: `m${i}`, name, description: "", calculationNote: "", period: "month" as const, unit: "", derived: false })),
    { kind: "dashboard", key: "board", name: "Sales board", description: "", slots: [], body: { widgets: [] } },
  ],
  overview: keptOverview(bundledPacks().get("ziffr/sales")!.pack), sample: { pack: "ziffr/sales", metrics: [] }, people: null, logo: null,
  unsigned: false, source: "included", reviewed: false, assistantTexts: [], blocked: "Sales 1.0.0 is installed already.",
};

describe("One ready-made set", () => {
  const h = framed(<OneSetView preview={preview} numberStyle={DEFAULT_NUMBER_STYLE} viewer="p" onUse={none} onOthers={none} />);
  it("draws the example dashboard under its words, with the two ways on and some metric names", () => {
    expect(h).toContain("Example dashboard, shown with sample numbers.");
    expect(h).toContain('data-preview="dashboard"');
    expect(buttons(h).slice(0, 2)).toEqual(["Use this set", "See other sets"]);
    expect(h).toContain("Some of the metrics");
    expect(h).toContain("Five");
    expect(h).toContain("And 2 more");
  });
  it("installs nothing from here, and leaves the checks to the set-up it opens", () => {
    expect(buttons(h)).not.toContain("Install");
    expect(h).not.toContain("installed already");
  });
  it("leaves the Packs page's own words under the drawing where no caption is given", () => {
    const own = framed(<PackPreviewView preview={preview} viewer="p" numberStyle={DEFAULT_NUMBER_STYLE} use={{ actions: null }} />);
    expect(own).toContain("drawn with Sample Data.");
  });
});

describe("the guided set-up's address", () => {
  it("is read back as the same Pack, for every one of Ziffr's own", () => {
    expect(packSetUpPath("ziffr/sales-forecast")).toBe("/use-pack/ziffr--sales-forecast");
    for (const id of INCLUDED_PACK_ORDER) expect(packRefOf(packSetUpPath(id).split("/").at(-1)!)).toEqual({ included: id });
  });
});
