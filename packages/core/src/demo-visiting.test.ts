// A demo visit's headers (spec 0051, ticket 3): sent only where visitors may change the demo, and only a valid Generation
// and id; the visit's key, never its id.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DemoStale } from "./demo";
import { DEMO_STALE, demoWordsForDigest } from "./demo-words";
import { visitKey } from "./demo-visit";
import { demoVisitHeaders } from "./demo-visiting";
import { runAsVisit, visitHeaders } from "./demo-visit-scope";

const ON = { ZIFFR_DEMO_CHANGES: "1", ZIFFR_DEMO_ONLY: "1" };
const ID = "0123456789abcdef0123456789abcdef";

describe("demoVisitHeaders", () => {
  it("carries the Generation and the visit's key, not its id", () => {
    const h = demoVisitHeaders({ generation: 7, visit: ID }, ON);
    expect(h).toEqual({ "x-ziffr-demo-visit": "7", "x-ziffr-demo-visit-key": visitKey(ID) });
    expect(JSON.stringify(h)).not.toContain(ID);
  });
  it("sends nothing where the setting is not in effect", () => {
    for (const settings of [{}, { ZIFFR_DEMO_CHANGES: "1" }, { ZIFFR_DEMO_ONLY: "1" }, { ZIFFR_DEMO_CHANGES: "0", ZIFFR_DEMO_ONLY: "1" }]) {
      expect(demoVisitHeaders({ generation: 7, visit: ID }, settings)).toBeNull();
    }
  });
  it("sends nothing for a Generation or an id that is not one", () => {
    for (const generation of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e16]) expect(demoVisitHeaders({ generation, visit: ID }, ON)).toBeNull();
    for (const visit of ["", "1", "ABCDEF0123456789ABCDEF0123456789", `${ID}0`]) expect(demoVisitHeaders({ generation: 1, visit }, ON)).toBeNull();
  });
});

describe("the stale refusal", () => {
  it("says in plain words that the demo was reset", () => {
    const e = new DemoStale();
    expect(e.message).toBe("The demo was reset; reload.");
    expect(demoWordsForDigest(e.digest)).toBe(DEMO_STALE);
  });
});

describe("a visit's scope", () => {
  const H = { "x-ziffr-demo-visit": "1", "x-ziffr-demo-visit-key": "k" };
  it("is there inside the work and gone after it, for a timer the work started too", async () => {
    expect(visitHeaders()).toBeNull();
    let later: Record<string, string> | null | undefined;
    const timer = new Promise<void>((done) => {
      void runAsVisit(H, async () => {
        expect(visitHeaders()).toBe(H);
        // As usage-calls.ts's interval, started on first use inside whatever work was running: it inherits the store.
        setTimeout(() => { later = visitHeaders(); done(); }, 5);
      });
    });
    await timer;
    expect(later).toBeNull();
  });

  it("is entered by nothing in the web app: only the core's demo-visiting.ts starts a visit", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
        const f = join(dir, name);
        if (statSync(f).isDirectory()) walk(f);
        else if (/\.(ts|tsx)$/.test(name) && readFileSync(f, "utf8").includes("demo-visit-scope")) hits.push(f);
      }
    };
    walk(join(__dirname, "../../../apps/web/src"));
    expect(hits).toEqual([]);
  });
});
