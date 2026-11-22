// The seven starting Packs (spec 0030, #279): Ziffr's own Packs in packs/, kept in this repository so they work
// offline. Each passes the checks Ziffr runs on any Pack, on this version of Ziffr, and says nothing to an assistant.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPack } from "./pack";
import { repoFile } from "./test/repo-file";

/** Every file in packs/, by name. */
export const STARTING_PACKS = readdirSync(repoFile("packs/")).filter((f) => f.endsWith(".pack.json")).sort();
/** A starting Pack's text. */
export const startingPack = (file: string) => readFileSync(repoFile(`packs/${file}`), "utf8");

describe("the starting Packs", () => {
  it("are the seven the specs name", () => {
    expect(STARTING_PACKS).toEqual(["agency.pack.json", "board-meeting.pack.json", "online-shop.pack.json", "saas-metrics.pack.json", "sports-club.pack.json", "workspace-usage.pack.json", "ziffr-operations.pack.json"]);
  });

  it.each(STARTING_PACKS)("%s passes every check, is Ziffr's under CC BY 4.0, and aims no text at an assistant", (file) => {
    const res = checkPack(startingPack(file));
    expect(res.ok ? [] : res.problems).toEqual([]);
    if (!res.ok) return;
    expect(res.pack.id).toBe(`ziffr/${file.replace(".pack.json", "")}`);
    expect([res.pack.author.name, res.pack.license]).toEqual(["Ziffr", "CC-BY-4.0"]);
    expect(res.assistantTexts).toEqual([]);
  });

  it("SaaS metrics 2.0 brings a logo, Tags on every entry, both decks and both close Workflows", () => {
    const res = checkPack(startingPack("saas-metrics.pack.json"));
    if (!res.ok) throw new Error("does not pass");
    const c = res.pack.contents;
    expect(res.pack.version).toBe("2.0.0");
    expect(res.pack.logo).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(c.metrics!.every((e) => (e.metric.tags ?? []).length > 0)).toBe(true);
    expect(c.decks!.map((d) => d.key)).toEqual(["monthly-report", "quarterly-board"]);
    expect(c.workflows!.map((d) => d.key)).toEqual(["monthly-close", "quarter-close"]);
    expect(c.themes![0].theme.slides?.logo).toBe("pack");
  });

  it("SaaS metrics decks use Placeholders only where the slide has a widget, and Show by only on Metrics that combine", () => {
    const res = checkPack(startingPack("saas-metrics.pack.json"));
    if (!res.ok) throw new Error("does not pass");
    const entries = new Map(res.pack.contents.metrics!.map((e) => [e.key, e.metric]));
    for (const { key, template } of res.pack.contents.decks!) {
      template.slides.forEach((slide, i) => {
        const words = slide.shapes.flatMap((sh) => ("text" in sh && sh.text ? sh.text : []));
        // A slide's Placeholders are filled from the Metrics of its own widgets: with none, they would stay visible.
        if (words.some((t) => t.includes("{"))) expect(slide.shapes.some((sh) => sh.shape === "widget"), `${key} slide ${i + 1}`).toBe(true);
        for (const sh of slide.shapes) {
          if (sh.shape !== "widget" || !sh.settings?.display) continue;
          const m = entries.get(template.slots[sh.slots[0]].suggests!)!;
          expect(Boolean(m.formula) || m.aggregation !== "none", `${key} slide ${i + 1} shows by ${sh.settings.display}`).toBe(true);
        }
      });
    }
  });
});
