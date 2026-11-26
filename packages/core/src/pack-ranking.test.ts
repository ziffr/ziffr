// The Pack ranking as a table (spec 0052, ticket 5; GLOSSARY: Pack Audience): every rule of the points, the reasons, the ties,
// a Pack with no audience, the empty profile, and the thirteen starting Packs against the answers they are for.
import { describe, expect, it } from "vitest";
import type { PackAudience } from "@ziffr/pack/audience";
import { becauseText, rankPacks, REASON_POINTS, suggestedPacks, type RankAnswers, type RankablePack } from "./pack-ranking";
import { bundledPacks, INCLUDED_PACK_ORDER } from "./included-packs";

const none: RankAnswers = { industry: null, segment: null, country: null, employeeBand: null, revenueBand: null, functions: [] };
const ans = (o: Partial<RankAnswers>): RankAnswers => ({ ...none, ...o });
const pack = (id: string, audience?: PackAudience, name = id): RankablePack => ({ id, name, audience });
const ids = (r: { id: string }[]) => r.map((x) => x.id);

const A = pack("a", { industries: ["saas"] });
const B = pack("b", { functions: ["finance"] });
const C = pack("c", { segments: ["b2b"] });
const D = pack("d", { employeeBands: ["11-50"] });
const E = pack("e", { revenueBands: ["1m-10m"] });
const F = pack("f", { countries: ["DE"] });
const G = pack("g");
const ALL = [G, F, E, D, C, B, A];

describe("rankPacks, part by part", () => {
  it.each([
    ["an industry", ans({ industry: "saas" }), "a", 4, ["industry"]],
    ["a function", ans({ functions: ["finance"] }), "b", 3, ["function"]],
    ["a segment", ans({ segment: "b2b" }), "c", 2, ["segment"]],
    ["an employee band", ans({ employeeBand: "11-50" }), "d", 1, ["employeeBand"]],
    ["a revenue band", ans({ revenueBand: "1m-10m" }), "e", 1, ["revenueBand"]],
    ["a country", ans({ country: "DE" }), "f", 1, ["country"]],
  ])("%s alone matches its Pack, with its points and its reason", (_n, answers, id, score, because) => {
    const r = rankPacks(answers, ALL);
    expect(r[0]).toEqual({ id, score, because });
    expect(r.filter((x) => x.score > 0)).toHaveLength(1);
  });

  it("weighs industry 4, function 3, segment 2, the bands and the country 1", () => {
    expect(REASON_POINTS).toEqual({ industry: 4, function: 3, segment: 2, employeeBand: 1, revenueBand: 1, country: 1 });
  });

  it("adds the points of every matched part and lists the reasons in the order of the points", () => {
    const all = pack("all", { industries: ["saas"], functions: ["finance"], segments: ["b2b"], employeeBands: ["11-50"], revenueBands: ["1m-10m"], countries: ["DE"] });
    const r = rankPacks(ans({ industry: "saas", functions: ["finance"], segment: "b2b", employeeBand: "11-50", revenueBand: "1m-10m", country: "DE" }), [all]);
    expect(r).toEqual([{ id: "all", score: 12, because: ["industry", "function", "segment", "employeeBand", "revenueBand", "country"] }]);
  });

  it("matches a Business Function when any of the people's functions is on the list, and counts it once", () => {
    const p = pack("p", { functions: ["finance", "management"] });
    expect(rankPacks(ans({ functions: ["management", "finance"] }), [p])[0]).toEqual({ id: "p", score: 3, because: ["function"] });
    expect(rankPacks(ans({ functions: ["sales", "people"] }), [p])[0].score).toBe(0);
  });

  it("matches a key on a list of several", () => {
    const p = pack("p", { industries: ["ecommerce", "retail"], employeeBands: ["1-10", "11-50"] });
    expect(rankPacks(ans({ industry: "retail", employeeBand: "11-50" }), [p])[0]).toEqual({ id: "p", score: 5, because: ["industry", "employeeBand"] });
  });
});

describe("rankPacks, what does not count", () => {
  it("does not push a Pack down for listing a part the person did not answer, or for missing", () => {
    const specific = pack("specific", { industries: ["saas"], segments: ["b2b"], countries: ["DE"] });
    const open = pack("open", { industries: ["saas"] });
    // Only the industry is answered: both score 4, the specific one is not behind.
    expect(rankPacks(ans({ industry: "saas" }), [specific, open]).map((r) => r.score)).toEqual([4, 4]);
    // A part answered and missed adds nothing but takes nothing away.
    expect(rankPacks(ans({ industry: "saas", segment: "b2c", country: "FR" }), [specific, open]).map((r) => r.score)).toEqual([4, 4]);
  });
  it("gives nothing for an answer the Pack does not list", () => {
    expect(rankPacks(ans({ industry: "agency", segment: "b2c", country: "FR", employeeBand: "1000+", revenueBand: "1b+", functions: ["other"] }), ALL).every((r) => r.score === 0)).toBe(true);
  });
  it("gives a Pack with no audience, and an empty one, no score and no reason", () => {
    const empty = pack("empty", {});
    const r = rankPacks(ans({ industry: "saas", functions: ["finance"] }), [G, empty]);
    expect(r).toEqual([{ id: "empty", score: 0, because: [] }, { id: "g", score: 0, because: [] }]);
  });
  it("does not read an audience that is not an audience, and never throws", () => {
    const hostile = [pack("x", { industries: "saas" as unknown as undefined }), pack("y", { functions: null as unknown as undefined }), pack("z", JSON.parse('{"__proto__": {"industries": ["saas"]}}'))];
    expect(() => rankPacks(ans({ industry: "saas" }), hostile)).not.toThrow();
    expect(rankPacks(ans({ industry: "saas" }), hostile).every((r) => r.score === 0)).toBe(true);
  });
});

describe("rankPacks, the empty and the partial profile", () => {
  it("lists every Pack in the fixed order with no answers", () => {
    const order = ["g", "f", "e", "d", "c", "b", "a"];
    const r = rankPacks(none, ALL, order);
    expect(ids(r)).toEqual(order);
    expect(r.every((x) => x.score === 0 && x.because.length === 0)).toBe(true);
    expect(suggestedPacks(r)).toEqual([]);
  });
  it("ranks by what is answered and keeps the rest in the fixed order", () => {
    const order = ["a", "b", "c", "d", "e", "f", "g"];
    expect(ids(rankPacks(ans({ segment: "b2b", country: "DE" }), ALL, order))).toEqual(["c", "f", "a", "b", "d", "e", "g"]);
  });
  it("never leaves a Pack out, whatever the answers", () => {
    for (const answers of [none, ans({ industry: "saas" }), ans({ industry: "saas", functions: ["finance"], segment: "b2b", country: "DE" })]) {
      expect(ids(rankPacks(answers, ALL)).sort()).toEqual(ids(ALL).sort());
    }
  });
});

describe("rankPacks, ties", () => {
  it("go by the fixed order, then the name, then the id", () => {
    const x = pack("x", { industries: ["saas"] }, "Zed");
    const y = pack("y", { industries: ["saas"] }, "Alpha");
    const w = pack("w", { industries: ["saas"] }, "Alpha");
    expect(ids(rankPacks(ans({ industry: "saas" }), [x, y], ["x", "y"]))).toEqual(["x", "y"]);
    expect(ids(rankPacks(ans({ industry: "saas" }), [x, y], ["y", "x"]))).toEqual(["y", "x"]);
    // Both off the list: by name.
    expect(ids(rankPacks(ans({ industry: "saas" }), [x, y]))).toEqual(["y", "x"]);
    // A Pack on the list comes before one that is not.
    expect(ids(rankPacks(ans({ industry: "saas" }), [y, x], ["x"]))).toEqual(["x", "y"]);
    // The same name: by id, whatever the input order.
    expect(ids(rankPacks(ans({ industry: "saas" }), [y, w]))).toEqual(["w", "y"]);
    expect(ids(rankPacks(ans({ industry: "saas" }), [w, y]))).toEqual(["w", "y"]);
  });
  it("is the same list for the same input, and does not change its input", () => {
    const answers = ans({ industry: "saas", country: "DE" });
    const input = [...ALL];
    const first = rankPacks(answers, input, ["a"]);
    expect(rankPacks(answers, input, ["a"])).toEqual(first);
    expect(input).toEqual(ALL);
    expect(ids(rankPacks(answers, [...ALL].reverse(), ["a"]))).toEqual(ids(first));
  });
});

describe("suggestedPacks and becauseText", () => {
  it("suggests the first three with a score above 0, and fewer when fewer match", () => {
    const answers = ans({ industry: "saas", functions: ["finance"], segment: "b2b", country: "DE" });
    expect(ids(suggestedPacks(rankPacks(answers, ALL)))).toEqual(["a", "b", "c"]);
    expect(ids(suggestedPacks(rankPacks(ans({ industry: "saas" }), ALL)))).toEqual(["a"]);
    expect(ids(suggestedPacks(rankPacks(ans({ industry: "saas", functions: ["finance"], segment: "b2b", country: "DE", employeeBand: "11-50" }), ALL)))).toEqual(["a", "b", "c"]);
  });
  it("joins at most two reasons in words", () => {
    expect(becauseText([])).toBe("");
    expect(becauseText(["industry"])).toBe("your industry");
    expect(becauseText(["industry", "function"])).toBe("your industry and your function");
    expect(becauseText(["industry", "function", "segment"])).toBe("your industry and your function");
    expect(becauseText(["industry", "function", "segment"], 3)).toBe("your industry, your function and who you sell to");
  });
});

describe("the thirteen starting Packs", () => {
  const packs = [...bundledPacks().values()].map(({ id, pack: p }) => ({ id, name: p.name, audience: p.audience }));
  const top3 = (answers: RankAnswers) => ids(suggestedPacks(rankPacks(answers, packs, INCLUDED_PACK_ORDER)));
  const firstOf = (a: PackAudience | undefined): RankAnswers => ({
    industry: a?.industries?.[0] ?? null, segment: a?.segments?.[0] ?? null, country: a?.countries?.[0] ?? null,
    employeeBand: a?.employeeBands?.[0] ?? null, revenueBand: a?.revenueBands?.[0] ?? null, functions: a?.functions ?? [],
  });

  // The answers each tagged Pack is meant for: the first key of every part it lists (and its functions), so each reaches the top three.
  it.each(packs.filter((p) => p.audience))("$id is in the top three for the answers it is for", (p) => {
    expect(top3(firstOf(p.audience))).toContain(p.id);
  });

  it.each([
    ["a SaaS founder", ans({ industry: "saas", segment: "b2b", functions: ["management"] }), "ziffr/saas-metrics"],
    ["an online shop owner", ans({ industry: "ecommerce", segment: "b2c", functions: ["management"] }), "ziffr/online-shop"],
    ["a one-person agency", ans({ industry: "agency", segment: "b2b", employeeBand: "1-10" }), "ziffr/agency"],
    ["a sports club's chair", ans({ industry: "other", segment: "non_profit" }), "ziffr/sports-club"],
    ["a head of sales", ans({ functions: ["sales"] }), "ziffr/sales"],
    ["a sales lead who runs the forecast", ans({ functions: ["sales"] }), "ziffr/sales-forecast"],
    ["a controller", ans({ functions: ["finance"] }), "ziffr/finance"],
    ["an HR lead", ans({ functions: ["people"] }), "ziffr/people"],
    ["a support lead", ans({ functions: ["customer_support"] }), "ziffr/customer-support"],
    ["a warehouse manager at a shop", ans({ industry: "ecommerce", functions: ["operations"] }), "ziffr/fulfilment"],
    ["a management board", ans({ functions: ["management"] }), "ziffr/board-meeting"],
  ])("suggests %s the Pack made for them", (_n, answers, id) => {
    expect(top3(answers)).toContain(id);
  });

  it("puts a Pack with no audience nowhere above one that matches, and has no reason for it", () => {
    const r = rankPacks(ans({ industry: "saas", functions: ["finance"] }), packs, INCLUDED_PACK_ORDER);
    for (const id of ["ziffr/workspace-usage", "ziffr/ziffr-operations"]) expect(r.find((x) => x.id === id)).toMatchObject({ score: 0, because: [] });
  });

  it("lists all thirteen for every row, none hidden", () => {
    for (const answers of [none, ans({ industry: "saas", segment: "b2b", functions: ["finance"], country: "DE" }), ans({ industry: "healthcare" })]) {
      expect(ids(rankPacks(answers, packs, INCLUDED_PACK_ORDER)).sort()).toEqual(packs.map((p) => p.id).sort());
      expect(packs).toHaveLength(13);
    }
  });

  it("with no answers is the order Ziffr ships its Packs in", () => {
    expect(ids(rankPacks(none, packs, INCLUDED_PACK_ORDER))).toEqual([...INCLUDED_PACK_ORDER]);
  });
});
