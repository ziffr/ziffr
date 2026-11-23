// @ts-nocheck
// The Workspace Profile's fixed lists (spec 0006, ticket #97): every country has a currency on the list, and only
// values on the lists get through.
import { describe, expect, it } from "vitest";
import { checkProfile, COUNTRIES, CURRENCIES, currencyFor, INDUSTRIES, INDUSTRY_LABEL, REVENUE_BANDS, REVENUE_LABEL, SEGMENTS, SEGMENT_LABEL } from "./workspace-profile";

describe("Workspace Profile lists", () => {
  it("has every ISO 3166-1 country once, each with a currency on the list", () => {
    expect(COUNTRIES).toHaveLength(249);
    expect(new Set(COUNTRIES).size).toBe(249);
    for (const c of COUNTRIES) {
      expect(c).toMatch(/^[A-Z]{2}$/);
      expect(CURRENCIES).toContain(currencyFor(c));
    }
    expect(currencyFor("DE")).toBe("EUR");
    expect(currencyFor("US")).toBe("USD");
    expect(currencyFor("CH")).toBe("CHF");
    expect(currencyFor("toString")).toBeNull();
    expect(currencyFor("XX")).toBeNull();
    for (const c of CURRENCIES) expect(c).toMatch(/^[A-Z]{3}$/);
  });
  it("names every industry, segment and revenue band", () => {
    for (const i of INDUSTRIES) expect(INDUSTRY_LABEL[i]).toBeTruthy();
    for (const s of SEGMENTS) expect(SEGMENT_LABEL[s]).toBeTruthy();
    for (const r of REVENUE_BANDS) expect(REVENUE_LABEL[r]).toBeTruthy();
  });
  it("lets only values on the lists through, and makes missing ones null", () => {
    expect(checkProfile({ industry: "saas", segment: "b2b", country: "DE", currency: "EUR", employeeBand: "11-50", revenueBand: "1m-10m" })).toEqual({
      ok: true, profile: { industry: "saas", segment: "b2b", country: "DE", currency: "EUR", employeeBand: "11-50", revenueBand: "1m-10m" },
    });
    expect(checkProfile({ segment: "" })).toEqual({ ok: true, profile: { industry: null, segment: null, country: null, currency: null, employeeBand: null, revenueBand: null } });
    expect(checkProfile(null)).toMatchObject({ ok: true });
    expect(checkProfile({ industry: "Software" })).toEqual({ ok: false, field: "industry" });
    expect(checkProfile({ country: "de" })).toEqual({ ok: false, field: "country" });
    expect(checkProfile({ currency: "BTC" })).toEqual({ ok: false, field: "currency" });
    expect(checkProfile({ employeeBand: 10 })).toEqual({ ok: false, field: "employeeBand" });
    expect(checkProfile({ revenueBand: ["1b+"] })).toEqual({ ok: false, field: "revenueBand" });
    expect(checkProfile({ country: "constructor" })).toEqual({ ok: false, field: "country" });
  });
});
