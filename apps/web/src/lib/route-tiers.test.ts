// Every page is in a Route Tier (spec 0055; GLOSSARY: Route Tier), and the phone check says for every Phone-first page
// how it is walked or why not, so a new screen cannot go unnoticed.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WALK } from "../../phone/walk";
import { ROUTE_TIERS } from "./route-tiers";

const APP = fileURLToPath(new URL("../app", import.meta.url));

// The folders of every page.tsx as routes. Route groups "(name)" are not part of an address.
const pages = readdirSync(APP, { recursive: true, encoding: "utf8" })
  .map((f) => f.split("\\").join("/").split("/"))
  .filter((parts) => parts.at(-1) === "page.tsx")
  .map((parts) => `/${parts.slice(0, -1).filter((p) => !p.startsWith("(")).join("/")}`)
  .sort();

describe("route tiers", () => {
  it("has every page in a tier: add a new page to src/lib/route-tiers.ts", () => {
    expect(pages.filter((route) => !(route in ROUTE_TIERS))).toEqual([]);
  });

  it("names no page that is gone", () => {
    expect(Object.keys(ROUTE_TIERS).filter((route) => !pages.includes(route))).toEqual([]);
  });

  it("says for every Phone-first page, and no other, how the phone check walks it or why not (phone/walk.ts)", () => {
    const first = Object.entries(ROUTE_TIERS).filter(([, tier]) => tier === "phone-first").map(([route]) => route);
    expect(Object.keys(WALK).sort()).toEqual(first.sort());
  });
});
