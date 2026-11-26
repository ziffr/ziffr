// An installed Pack keeps its Positions and Repeats and says them, against the real database (spec 0058, #1178;
// GLOSSARY: Pack, Position, Repeat): after installing and after updating, of the items it still has, to everyone in the
// Workspace but Guests.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { installPackFile, listInstalledPacks } from "./packs";
import { updatePackFile } from "./pack-updates";
import { SALES_TEAM, salesTeamText } from "./test/sales-team-pack";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const ok = { unsigned: true, assistantTexts: true };

describe("an installed Pack with Positions", () => {
  it("says what each Position does, to Members and not to Guests", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const [sara, mia, gus] = [await w.person("owner"), await w.person("member"), await w.person("guest")];
    await installPackFile(w.actor(sara), salesTeamText(), ok);
    const [pack] = await listInstalledPacks(w.actor(mia, "member"));
    expect(pack.people!.positions.map((p) => p.name)).toEqual(["Sales lead", "Observers", "Salesperson"]);
    expect(pack.people!.positions[0].does).toContain("Approves in the Workflow Weekly forecast.");
    expect(pack.people!.positions[2].does).toContain("Submits Commit.");
    expect(pack.people!.repeats).toEqual([expect.objectContaining({ name: "Salesperson", max: 12 })]);
    expect(await listInstalledPacks(w.actor(gus, "guest"))).toEqual([]);
  });

  it("names items as they are named now, leaves removed ones out, and follows an update", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const install = await installPackFile(w.actor(sara), salesTeamText(), ok);
    await db().from("team_templates").update({ name: "Our forecast" }).eq("pack_install_id", install).eq("pack_key", "weekly");
    await db().from("team_templates").delete().eq("pack_install_id", install).eq("pack_key", "team");
    const [renamed] = await listInstalledPacks(w.actor(sara));
    expect(renamed.people!.positions[0].does).toContain("Approves in the Workflow Our forecast.");
    expect(JSON.stringify(renamed.people!.shares)).not.toContain("Team forecast");
    const next = structuredClone(SALES_TEAM);
    next.version = "1.1.0";
    next.positions![0].name = "Head of Sales";
    await updatePackFile(w.actor(sara), install, JSON.stringify(next), ok);
    const [updated] = await listInstalledPacks(w.actor(sara));
    expect(updated.people!.positions[0].name).toBe("Head of Sales");
  });
});
