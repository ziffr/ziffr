// Pack Audience checks (GLOSSARY: Pack Audience; spec 0052): a valid audience passes, and every kind of invalid one is
// refused with a message that names the part; the lists are the ones the Workspace Profile uses.
import { describe, expect, it } from "vitest";
import { AUDIENCE_LIMITS, AUDIENCE_SINCE, COUNTRIES, EMPLOYEE_BANDS, INDUSTRIES, REVENUE_BANDS, SEGMENTS } from "./audience.js";
import { BUSINESS_FUNCTIONS } from "./business-functions.js";
import { checkPack } from "./pack.js";

const base = {
  format: "ziffr.pack/1", id: "ziffr/test", name: "Test", version: "1.0.0", summary: "A test.", author: { name: "Ziffr" }, license: "MIT", ziffr: ">=0.16",
  contents: { metrics: [{ key: "orders", metric: { format: "ziffr.metric/1", name: "Orders", period: "month", aggregation: "sum", polarity: "higher" } }] },
};
const withAudience = (audience: unknown, over: Record<string, unknown> = {}) => JSON.stringify({ ...base, ...over, audience }, null, 2);
const problems = (text: string) => { const r = checkPack(text); return r.ok ? [] : r.problems.map((p) => `${p.path}: ${p.message}`); };

describe("a valid Pack Audience", () => {
  it.each([
    ["every part", { industries: ["saas"], segments: ["b2b"], functions: ["management", "finance"], employeeBands: ["11-50", "51-200"], revenueBands: ["1m-10m"], countries: ["DE", "AT", "CH"] }],
    ["one part", { functions: ["sales"] }],
    ["every key of a list", { industries: [...INDUSTRIES], functions: [...BUSINESS_FUNCTIONS], segments: [...SEGMENTS], employeeBands: [...EMPLOYEE_BANDS], revenueBands: [...REVENUE_BANDS] }],
    ["the most countries", { countries: COUNTRIES.slice(0, AUDIENCE_LIMITS.countries) }],
  ])("passes: %s", (_n, a) => {
    const r = checkPack(withAudience(a));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pack.audience).toEqual(a);
  });
  it("is optional: a Pack without one passes and has none", () => {
    const r = checkPack(JSON.stringify(base));
    expect(r.ok && r.pack.audience).toBeFalsy();
  });
});

describe("an invalid Pack Audience is refused in words", () => {
  it.each([
    ["an unknown key", { industries: ["wizardry"] }, "audience.industries[0]", "must be one of"],
    ["a label instead of a key", { functions: ["People and HR"] }, "audience.functions[0]", "must be one of"],
    ["a country that does not exist", { countries: ["XX"] }, "audience.countries[0]", "is not an ISO country code"],
    ["a lower-case country", { countries: ["de"] }, "audience.countries[0]", "is not an ISO country code"],
    ["a three-letter country", { countries: ["DEU"] }, "audience.countries[0]", "at most 2"],
    ["a repeated key", { functions: ["sales", "sales"] }, "audience.functions[1]", "listed twice"],
    ["a repeated country", { countries: ["DE", "DE"] }, "audience.countries[1]", "listed twice"],
    ["an empty part", { industries: [] }, "audience.industries", "must not be empty"],
    ["an empty audience", {}, "audience", "is empty"],
    ["a part that is not a list", { industries: "saas" }, "audience.industries", "must be a list"],
    ["a number in a list", { segments: [1] }, "audience.segments[0]", ""],
    ["an object in a list", { segments: [{ a: 1 }] }, "audience.segments[0]", ""],
    ["an unknown part", { sizes: ["big"] }, "audience.sizes", "is not a field here"],
    ["a prototype part", JSON.parse('{"__proto__": ["x"], "functions": ["sales"]}'), "audience.__proto__", "is not a field here"],
    ["an audience that is a list", ["saas"], "audience", "must be an object"],
    ["an audience that is a text", "everyone", "audience", "must be an object"],
    ["markup in a key", { industries: ["<script>alert(1)</script>"] }, "audience.industries[0]", "must be one of"],
  ])("%s", (_n, a, path, message) => {
    const found = problems(withAudience(a));
    expect(found.some((p) => p.startsWith(`${path}`) && p.includes(message)), found.join("\n")).toBe(true);
  });

  it("refuses a part with more keys than its list has", () => {
    const found = problems(withAudience({ segments: ["b2b", "b2c", "b2b2c", "public_sector", "non_profit", "b2b"] }));
    expect(found.join("\n")).toContain("at most 5 are allowed");
  });
  it("refuses more than 50 countries", () => {
    const found = problems(withAudience({ countries: COUNTRIES.slice(0, 51) }));
    expect(found.join("\n")).toContain("at most 50 are allowed");
  });
  it("needs the ziffr minimum beside an audience", () => {
    const text = JSON.stringify({ ...base, audience: { functions: ["sales"] } }, (k, v) => (k === "ziffr" ? undefined : v));
    const found = problems(text);
    expect(found.join("\n")).toContain(`needs the field “ziffr”`);
    expect(found.join("\n")).toContain(AUDIENCE_SINCE);
  });
  it("never echoes a long hostile key in full", () => {
    const found = problems(withAudience({ countries: ["Z".repeat(500)] }));
    expect(found.join("\n").length).toBeLessThan(400);
  });
  it("keeps a part's size cap and its list the same size", () => {
    expect(AUDIENCE_LIMITS.industries).toBe(INDUSTRIES.length);
    expect(AUDIENCE_LIMITS.segments).toBe(SEGMENTS.length);
    expect(AUDIENCE_LIMITS.functions).toBe(BUSINESS_FUNCTIONS.length);
    expect(AUDIENCE_LIMITS.employeeBands).toBe(EMPLOYEE_BANDS.length);
    expect(AUDIENCE_LIMITS.revenueBands).toBe(REVENUE_BANDS.length);
  });
});

describe("the fixed lists", () => {
  it("have no repeats and country codes of two capitals", () => {
    for (const l of [INDUSTRIES, SEGMENTS, EMPLOYEE_BANDS, REVENUE_BANDS, COUNTRIES, BUSINESS_FUNCTIONS]) expect(new Set(l).size).toBe(l.length);
    expect(COUNTRIES).toHaveLength(249);
    for (const c of COUNTRIES) expect(c).toMatch(/^[A-Z]{2}$/);
  });
});
