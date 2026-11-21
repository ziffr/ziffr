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
});
