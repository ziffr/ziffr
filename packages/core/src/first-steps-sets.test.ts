// Which ready-made sets First Steps offers (spec 0067; GLOSSARY: First Steps, Pack): the order it is given is kept, three
// of Ziffr's own Packs are no start, a person alone is offered private ones only (those for their topic), each reason is said in the words of the
// question asked, and every offered Pack has a dashboard to show.
import { describe, expect, it } from "vitest";
import { offersSets, PRIVATE_SETS, TOPICS } from "./first-steps-screens";
import { offeredSets } from "./first-steps-sets";
import { bringsOf, bundledPacks, type RecommendedPack } from "./included-packs";
import type { Reason } from "./pack-ranking";

const all = (because: Record<string, Reason[]> = {}): RecommendedPack[] => [...bundledPacks().values()].map(({ id, pack }) => ({
  id, name: pack.name, summary: pack.summary, logo: null, brings: bringsOf(pack), because: because[id] ?? [], suggested: false, installed: false, installId: null, needsOwner: false,
}));
const ids = (list: { id: string }[]) => list.map((s) => s.id);
const PRIVATE = ["ziffr/my-money", "ziffr/health-and-habits", "ziffr/my-time"];
const LEFT_OUT = ["ziffr/board-meeting", "ziffr/workspace-usage", "ziffr/ziffr-operations", ...PRIVATE];

describe("offeredSets", () => {
  it("offers a team every one of Ziffr's own Packs but the three that are no start and those for private use, in the order given", () => {
    const given = all().reverse();
    expect(ids(offeredSets(given, "team"))).toEqual(ids(given).filter((id) => !LEFT_OUT.includes(id)));
    expect(offeredSets(given, "team")).toHaveLength(bundledPacks().size - LEFT_OUT.length);
  });
  it("says of each set what setting it up does, in the Pack's own sentence", () => {
    for (const s of offeredSets(all(), "team")) expect(s.summary, s.id).toBe(bundledPacks().get(s.id)!.pack.setUp!.line);
  });
  it("offers a person alone only the private sets of their topic, and a team the Sports club among theirs", () => {
    const of = (topic: (typeof TOPICS)[number] | null) => ids(offeredSets(all(), "me", topic)).sort();
    expect(of(null)).toEqual([]);
    expect(of("money")).toEqual(["ziffr/my-money"]);
    expect(of("health")).toEqual(["ziffr/health-and-habits"]);
    expect(of("habits")).toEqual(["ziffr/health-and-habits", "ziffr/my-time"]);
    expect(of("club")).toEqual([]);
    expect(of("other")).toEqual([]);
    for (const topic of [null, "club", "other"] as const) expect(offersSets("me", topic), String(topic)).toBe(false);
    for (const topic of ["money", "health", "habits"] as const) expect(offersSets("me", topic), topic).toBe(true);
    expect(offersSets("team", null)).toBe(true);
    expect(ids(offeredSets(all(), "team"))).toContain("ziffr/sports-club");
  });
  it("never offers a team a set for private use, nor a person alone a set for a team", () => {
    for (const id of PRIVATE) expect(ids(offeredSets(all(), "team")), id).not.toContain(id);
    for (const topic of TOPICS) for (const id of ids(offeredSets(all(), "me", topic))) expect(PRIVATE, id).toContain(id);
  });
  it("names only Packs of Ziffr's own as private ones", () => {
    for (const s of PRIVATE_SETS) expect(bundledPacks().has(s.pack), s.pack).toBe(true);
  });
  it("counts the metrics and says why a set fits, naming the two reasons that count most", () => {
    const sets = offeredSets(all({ "ziffr/online-shop": ["industry", "function", "segment"], "ziffr/sales": ["segment"], "ziffr/finance": ["employeeBand", "revenueBand"], "ziffr/people": ["country"] }), "team");
    const of = (id: string) => sets.find((s) => s.id === id)!;
    expect(of("ziffr/online-shop").match).toBe("Matches your business and role");
    expect(of("ziffr/sales").match).toBe("Matches your customers");
    expect(of("ziffr/finance").match).toBe("Matches your size and revenue");
    expect(of("ziffr/people").match).toBe("Matches your country");
    expect(of("ziffr/agency").match).toBeNull();
    expect(of("ziffr/sales").metrics).toBe(bundledPacks().get("ziffr/sales")!.pack.contents.metrics!.length);
  });
  it("carries no more than the list shows", () => {
    expect(Object.keys(offeredSets(all(), "team")[0]).sort()).toEqual(["id", "match", "metrics", "name", "summary"]);
  });
  it("offers only Packs with a dashboard to show", () => {
    for (const s of offeredSets(all(), "team")) expect(bundledPacks().get(s.id)!.pack.contents.dashboards?.length, s.id).toBeGreaterThan(0);
  });
});
