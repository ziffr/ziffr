// The demo's previous ids (spec 0051, ticket 7; GLOSSARY: Demo Reset): a Demo Reset gives the seed's dashboards and decks new
// ids, `demo_previous_ids` keeps the old ones with their names, and `demoSuccessor` finds the new id of the same name for
// a person who may open it. Only the SQL step of the reset is run here.
import { describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { db } from "./db";
import { demoSuccessor } from "./demo-successor";
import { readDemoState } from "./demo-reset";
import { DEMO_WORKSPACE_ID } from "./team";

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };

async function demoRows(table: "dashboards" | "decks") {
  const { data, error } = await db().from(table).select("id, name").eq("workspace_id", DEMO_WORKSPACE_ID);
  expect(error).toBeNull();
  return (data ?? []) as { id: number; name: string }[];
}

async function reset() {
  const { data, error } = await db().rpc("demo_reset", { min_gap: "0 seconds" });
  expect(error).toBeNull();
  expect(data).toBe(true);
}

describe("demo_previous_ids", () => {
  it("keeps every seeded dashboard's and deck's old id and name at a reset, with the Generation that ended", async () => {
    const dashboards = await demoRows("dashboards");
    const decks = await demoRows("decks");
    const before = await readDemoState();
    expect(dashboards.length).toBeGreaterThan(0);
    await reset();
    const { data } = await db().from("demo_previous_ids").select("kind, old_id, name, generation");
    const kept = new Map((data ?? []).map((r) => [`${r.kind}:${r.old_id}`, r]));
    for (const d of dashboards) expect(kept.get(`dashboard:${d.id}`)).toMatchObject({ name: d.name, generation: before?.generation });
    for (const k of decks) expect(kept.get(`deck:${k.id}`)).toMatchObject({ name: k.name, generation: before?.generation });
    // The old ids are gone from the demo: ids are never reused.
    const now = new Set((await demoRows("dashboards")).map((d) => d.id));
    for (const d of dashboards) expect(now.has(d.id)).toBe(false);
  });

  it("finds the new id of the same name, also across two resets", async () => {
    const [first] = (await demoRows("dashboards")).filter((d) => d.name === "Monthly overview");
    expect(first).toBeTruthy();
    await reset();
    const second = (await demoRows("dashboards")).find((d) => d.name === first.name)!;
    expect(await demoSuccessor(sara, "dashboard", first.id)).toBe(second.id);
    await reset();
    const third = (await demoRows("dashboards")).find((d) => d.name === first.name)!;
    expect(await demoSuccessor(sara, "dashboard", first.id)).toBe(third.id);
    expect(await demoSuccessor(sara, "dashboard", second.id)).toBe(third.id);
  });

  it("finds a deck's too, and does not mix a dashboard's id with a deck's", async () => {
    const [deck] = await demoRows("decks");
    if (!deck) return;
    await reset();
    const renewed = (await demoRows("decks")).find((d) => d.name === deck.name)!;
    expect(await demoSuccessor(sara, "deck", deck.id)).toBe(renewed.id);
    expect(await demoSuccessor(sara, "dashboard", deck.id)).not.toBe(renewed.id);
  });

  it("gives nothing for an id that was never kept, for a bad id, or outside the demo", async () => {
    expect(await demoSuccessor(sara, "dashboard", 2_000_000_000)).toBeNull();
    expect(await demoSuccessor(sara, "dashboard", -1)).toBeNull();
    expect(await demoSuccessor(sara, "dashboard", 1.5)).toBeNull();
    const [any] = (await db().from("demo_previous_ids").select("old_id").eq("kind", "dashboard").limit(1)).data ?? [];
    expect(await demoSuccessor({ ...sara, workspaceId: "00000000-0000-4000-8000-000000000999" }, "dashboard", any.old_id as number)).toBeNull();
  });

  it("keeps no more than a day of Generations", async () => {
    await reset();
    const state = await readDemoState();
    const { data } = await db().from("demo_previous_ids").select("generation");
    expect(Math.min(...(data ?? []).map((r) => Number(r.generation)))).toBeGreaterThanOrEqual((state?.generation ?? 0) - 1 - 96);
  });
});
