// The final review's limits against the database (GLOSSARY: Demo Mode, Token; spec 0051, final review D2 and D4): an address's share of
// a kind's cap is counted in `demo_visit_counts` and refuses past a quarter of the cap (another address is not held by it), a Reset
// empties the counts, and a form link of the demo opens only with a demo visit's cookie. Written for the database test run of CI; the
// author could not run it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { chargeCreation } from "./demo-creation";
import { DEMO_ROW_CAPS, demoCreationShare } from "./demo-limits";
import { resetDemoWorkspace } from "./demo-reset";
import { runAsVisit } from "./demo-visit-scope";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { submissionForm } from "./page-data";
import { DEMO_WORKSPACE_ID } from "./team";
import { demoBackToSeed } from "./test/demo-walk";

const demo = { workspaceId: DEMO_WORKSPACE_ID };
const SECRET = "k".repeat(40);
const from = (ip: string) => ({ visitId: "0123456789abcdef0123456789abcdef", headers: new Headers({ "x-forwarded-for": ip }) });
const asVisit = <T>(work: () => Promise<T>) => runAsVisit({ "x-ziffr-demo-visit": "1", "x-ziffr-demo-visit-key": "a".repeat(32) }, work);

beforeAll(async () => {
  process.env.ZIFFR_PROXY_HOPS = "1";
  await resetDemoWorkspace({ openToVisitors: true });
}, 180_000);
afterAll(async () => { await demoBackToSeed(); }, 180_000);

describe("an address's share of a kind", () => {
  it("lets one address make a quarter of the cap, refuses the next, and does not hold another address", async () => {
    const share = demoCreationShare(DEMO_ROW_CAPS.dashboards);
    for (let i = 0; i < share.address; i += 1) await asVisit(() => chargeCreation(demo, from("203.0.113.9"), "home-actions:newDashboard", SECRET));
    await expect(asVisit(() => chargeCreation(demo, from("203.0.113.9"), "home-actions:newDashboard", SECRET))).rejects.toThrow(DemoSizeRefused);
    // Another address of another network, and another kind of the same address, are not held.
    await asVisit(() => chargeCreation(demo, from("198.51.100.4"), "home-actions:newDashboard", SECRET));
    await asVisit(() => chargeCreation(demo, from("203.0.113.9"), "deck-actions:createDeck", SECRET));
  });

  it("is emptied by a Demo Reset", async () => {
    await resetDemoWorkspace({ openToVisitors: true });
    const { count } = await db().from("demo_visit_counts").select("*", { count: "exact", head: true });
    expect(count).toBe(0);
  }, 180_000);
});

describe("a form link of the demo", () => {
  it("opens only with a demo visit's cookie", async () => {
    const { data: tokens } = await db().from("tokens").select("code").eq("workspace_id", DEMO_WORKSPACE_ID);
    const opens: string[] = [];
    for (const t of tokens ?? []) if (await submissionForm(String(t.code), true)) opens.push(String(t.code));
    expect(opens.length).toBeGreaterThan(0);
    for (const code of opens) expect(await submissionForm(code)).toBeNull();
  });
});
