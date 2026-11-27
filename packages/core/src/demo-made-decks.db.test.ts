// Made decks in the demo, against the database (GLOSSARY: Demo Mode, Deck, Deck Description; spec 0069): a visit makes
// one from a dashboard and writes on it, its words pass the demo's text rules, and a deck the seed made is kept as it is.
import { assertDemoIsOnlyWorkspace, demoBackToSeed } from "./test/demo-walk";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Actor } from "./actor";
import { db } from "./db";
import { readDeck } from "./deck-read";
import { clearDeckAnswers, makeDeckFromDashboard, saveMadeDeck } from "./deck-write";
import { resetDemoWorkspace } from "./demo-reset";
import { DemoShowcase } from "./demo";
import { DemoTextRefused } from "./demo-visitor-words";
import { visitingDemo } from "./demo-visiting";
import { forgetStoredSettings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";

vi.mock("./made-decks-on", () => ({ MADE_DECKS_ON: true }));

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
const env = { ZIFFR_DEMO_CHANGES: "1", ZIFFR_DEMO_ONLY: "1", ZIFFR_DEMO_ADDRESS_KEY: "k".repeat(40), ZIFFR_PROXY_HOPS: "1" };
const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));

beforeAll(async () => {
  await assertDemoIsOnlyWorkspace();
  await resetDemoWorkspace({ openToVisitors: true });
  Object.assign(process.env, env);
  forgetStoredSettings();
}, 180_000);

afterAll(async () => {
  for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  forgetStoredSettings();
  await demoBackToSeed();
}, 180_000);

/** Runs work as a visit of the current Generation. */
async function asVisit<T>(work: () => Promise<T>): Promise<T> {
  const generation = Number((await db().from("demo_state").select("generation").single()).data?.generation);
  return visitingDemo({ generation, visit: "0123456789abcdef0123456789abcdef" }, work);
}

describe("a made deck in the demo", () => {
  it("is made and written on by a visit, in words the demo takes", async () => {
    const dashboard = Number((await db().from("widgets").select("dashboard_id, dashboards!inner(owner_id)").eq("workspace_id", DEMO_WORKSPACE_ID).eq("dashboards.owner_id", sara.personId).order("dashboard_id").limit(1).single()).data?.dashboard_id);
    await asVisit(async () => {
      const deck = await makeDeckFromDashboard(sara, dashboard);
      const slide = (await readDeck(sara, deck)).deck.description.slides.find((s) => s.type === "chart")!.id;
      await saveMadeDeck(sara, deck, { slides: [{ id: slide, headline: "A steady month" }] });
      await clearDeckAnswers(sara, deck);
      await expect(saveMadeDeck(sara, deck, { slides: [{ id: slide, headline: "See https://example.com/offer" }] })).rejects.toThrow(DemoTextRefused);
      expect((await readDeck(sara, deck)).deck.description.slides.find((s) => s.id === slide)!.headline).toBe("A steady month");
    });
  });

  it("leaves a deck the seed made as it is", async () => {
    const seeded = Number((await db().from("decks").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).order("id").limit(1).single()).data?.id);
    await asVisit(async () => {
      await expect(saveMadeDeck(sara, seeded, {})).rejects.toThrow(DemoShowcase);
      await expect(clearDeckAnswers(sara, seeded)).rejects.toThrow(DemoShowcase);
    });
  });
});
