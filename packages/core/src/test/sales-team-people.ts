// A sales team for database tests of spec 0058: a Workspace with its Owner, a Sales lead, two salespeople, an
// observer, a Guest and a Contact, and what a person would pick to set the sales team's Pack up for them.
import type { PackSetupInput } from "../pack-setup-build";
import { openNames } from "../sealed-columns";
import { db } from "../db";
import { workspace } from "./db-fixtures";

/** The team, and the picks of a full Set up: every entry, both dashboards, the Workflow, and a line per salesperson. */
export async function salesTeam(cleanups: (() => Promise<void>)[]) {
  const w = await workspace("Sales");
  cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const [lena, anna, ben, omar] = [await w.person("member"), await w.person("member"), await w.person("member"), await w.person("member")];
  const gus = await w.person("guest");
  const cora = await w.contact({ email: "cora@example.test" });
  const { data } = await db().from("profiles").select("id, name").in("id", [sara, lena, anna, ben, omar, gus, cora]);
  const names = new Map((await openNames(w.id, data)).map((p) => [String(p.id), String(p.name)]));
  const input: PackSetupInput = {
    metrics: ["commit", "quota", "gap"],
    dashboard: { key: "team" },
    lineDashboards: [{ key: "mine" }],
    workflow: { key: "weekly" },
    people: [{ position: "lead", people: [lena] }, { position: "observers", people: [omar] }],
    lines: [{ repeat: "rep", name: "Anna", people: [{ position: "seller", people: [anna] }] }, { repeat: "rep", name: "Ben", people: [{ position: "seller", people: [ben] }] }],
  };
  return { w, sara, lena, anna, ben, omar, gus, cora, input, name: (id: string) => names.get(id)! };
}
