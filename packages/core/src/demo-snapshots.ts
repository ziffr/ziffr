// The demo's Snapshots (spec 0013; ADR 0005; GLOSSARY: Snapshot): after the demo is reset, its "October in short"
// dashboard gets Snapshots of the last two complete months, taken and shown by its owner, so visitors find an
// archive to open. Only ever in the demo workspace; a failure leaves the demo without them and nothing else.
import type { Actor } from "./actor";
import { db } from "./db";
import { completePeriods } from "./snapshot-periods";
import { showSnapshot, takeSnapshot } from "./snapshots";
import { DEMO_WORKSPACE_ID } from "./team";

/** Takes and shows the demo's Snapshots; called right after the demo's reset. */
export async function seedDemoSnapshots(today = new Date().toISOString().slice(0, 10)): Promise<void> {
  const { data: dash } = await db().from("dashboards").select("id, owner_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("name", "October in short").maybeSingle();
  if (!dash) return;
  const owner: Actor = { personId: dash.owner_id as string, workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
  // Oldest first, so the list reads newest first like any other.
  for (const p of completePeriods("month", today, 2).reverse()) {
    try {
      await showSnapshot(owner, await takeSnapshot(owner, dash.id as number, { kind: p.kind, start: p.start }, { today }));
    } catch {
      console.error(`Demo: no Snapshot of ${p.label}`);
    }
  }
}
