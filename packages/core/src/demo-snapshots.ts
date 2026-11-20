// The demo's Snapshots (spec 0013; ADR 0005; GLOSSARY: Snapshot): after the demo is reset, its "October in short"
// dashboard gets Snapshots of the last two complete months, taken and shown by its owner, so visitors find an
// archive to open. Only ever in the demo workspace; a failure leaves the demo without them and nothing else.
import type { Actor } from "./actor";
import { db, seedingDemo } from "./db";
import { completePeriods } from "./snapshot-periods";
import { showSnapshot, takeSnapshot } from "./snapshots";
import { DEMO_WORKSPACE_ID } from "./team";
import { JANUARY } from "./periods";

/** The first day of the week the demo's Weekly numbers story is about (ISO week 47 of 2026). */
export const WEEKLY_NUMBERS_WEEK = "2026-11-16";

/** Takes and shows the demo's Snapshots; called right after the demo's reset. Part of the seed, so it may write the
 * demo, which nothing a visitor does may (#271). */
export function seedDemoSnapshots(today = new Date().toISOString().slice(0, 10)): Promise<void> {
  return seedingDemo(() => takeDemoSnapshots(today));
}

async function takeDemoSnapshots(today: string): Promise<void> {
  const { data: dash } = await db().from("dashboards").select("id, owner_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("name", "October in short").maybeSingle();
  if (!dash) return;
  const owner: Actor = { personId: dash.owner_id as string, workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
  // Oldest first, so the list reads newest first like any other. Months are the same whatever the year start.
  for (const p of completePeriods("month", today, 2, JANUARY).reverse()) {
    try {
      await showSnapshot(owner, await takeSnapshot(owner, dash.id as number, { kind: p.kind, start: p.start }, { today }));
    } catch {
      console.error(`Demo: no Snapshot of ${p.label}`);
    }
  }
  await takeWeeklyNumbersSnapshot();
}

/** The Snapshot of week 47 of 2026 on the "Weekly numbers" dashboard, as the demo's Period Timeline tells it: ready on
 * Wednesday 18 November at 10:00, when the week locked. The week is fixed (the seed's is), so the time it was shown is
 * set afterwards (the time it was taken is kept by the database and stays the reset's); `today` is the first day after
 * the week, which is what makes it "over". */
async function takeWeeklyNumbersSnapshot(): Promise<void> {
  const { data: dash } = await db().from("dashboards").select("id, owner_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("name", "Weekly numbers").maybeSingle();
  if (!dash) return;
  const owner: Actor = { personId: dash.owner_id as string, workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
  try {
    const id = await takeSnapshot(owner, dash.id as number, { kind: "week", start: WEEKLY_NUMBERS_WEEK }, { today: "2026-11-23" });
    await showSnapshot(owner, id);
    await db().from("dashboard_snapshots").update({ shown_at: "2026-11-18T10:00:30Z" }).eq("id", id).throwOnError();
  } catch {
    console.error("Demo: no Snapshot of the Weekly numbers");
  }
}
