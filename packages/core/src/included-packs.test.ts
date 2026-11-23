// Ziffr's own Packs as they come with the app (spec 0052, ticket 4): the generated file is what packs/ gives, every Pack
// in it passes the checks Ziffr runs on any Pack, and an id that is not one of them is refused whatever it holds.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { bundledPacks, bringsOf, installIncludedPack, INCLUDED_PACK_ORDER, readIncludedPack } from "./included-packs";
import { INCLUDED_PACK_FILES } from "./included-packs.generated";
import { checkPack } from "./pack";
import { repoFile } from "./test/repo-file";

describe("the Packs that come with Ziffr", () => {
  it("are what packs/ gives: the generated file is current, byte for byte", async () => {
    const { renderIncluded } = (await import(repoFile("scripts/generate-included-packs.mjs").href)) as { renderIncluded: () => string };
    expect(readFileSync(new URL("./included-packs.generated.ts", import.meta.url), "utf8")).toBe(renderIncluded());
    const files = readdirSync(repoFile("packs/")).filter((f) => f.endsWith(".pack.json")).map((f) => f.replace(".pack.json", "")).sort();
    expect(INCLUDED_PACK_FILES.map(([n]) => n)).toEqual(files);
  });

  it("are the twelve, in the order Ziffr ships them in, each passing every check and aiming no text at an assistant", () => {
    const all = bundledPacks();
    expect([...all.keys()]).toEqual([...INCLUDED_PACK_ORDER]);
    expect(all.size).toBe(12);
    for (const { id, text, pack } of all.values()) {
      const res = checkPack(text);
      expect(res.ok ? [] : res.problems, id).toEqual([]);
      if (res.ok) expect(res.assistantTexts, id).toEqual([]);
      expect([pack.author.name, pack.license], id).toEqual(["Ziffr", "CC-BY-4.0"]);
    }
  });

  it("say what they bring as counts and the first names, from the file only", () => {
    const saas = bringsOf(bundledPacks().get("ziffr/saas-metrics")!.pack, 3);
    const metrics = saas.find((b) => b.kind === "metric")!;
    expect(metrics.count).toBe(13);
    expect(metrics.names).toHaveLength(3);
    expect(saas.map((b) => b.kind)).toEqual(expect.arrayContaining(["metric", "dashboard", "deck", "workflow", "theme"]));
  });

  it("refuse an id that is not one of them, however it is written, before any database call", async () => {
    const actor = { personId: "p", workspaceId: "w", role: "owner" as const };
    for (const id of ["../packs/sales", "ziffr/sales.pack.json", "ziffr/../sales", "constructor", "__proto__", "ZIFFR/SALES", "", "ziffr/nothing", 7, null, { toString: () => "ziffr/sales" }]) {
      await expect(installIncludedPack(actor, id as string), String(id)).rejects.toBeInstanceOf(Forbidden);
      await expect(readIncludedPack(actor, id as string), String(id)).rejects.toBeInstanceOf(Forbidden);
    }
  });
});
