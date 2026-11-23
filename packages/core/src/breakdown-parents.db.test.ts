// Breakdown parents against the real database (GLOSSARY: Breakdown; spec 0041, ticket 12): a row may be a part of another row of
// the SAME Breakdown. Every way in (a program's request, a pasted spreadsheet, a Feed) is checked by the core in words and by
// the database as the last guard, and the two agree: whatever the core refuses, the raw table refuses too (a test per rule).
// A part is never read as a row at the top, and nothing of a refused list is recorded.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readParents } from "@ziffr/pack/breakdown-parents";
import { createAccessKey, actorForKey } from "./access-keys";
import type { KeyActor } from "./actor";
import { submitObservation } from "./api-submissions";
import { db } from "./db";
import { JANUARY, periodStart } from "./periods";
import { reserveIds } from "./sealed-columns";
import { submitValue, type SubmissionEffects } from "./submissions";
import { opened, workspace } from "./test/db-fixtures";
import { getBreakdowns } from "./workspace-data";
import { forgetWorkspaceKey, workspaceCipher } from "./workspace-keys";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c().catch(() => {}); }, 120_000);
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });
const month = () => periodStart(new Date(), "month", JANUARY);

async function setup(rule = "add") {
  const w = await workspace("Parents");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const ben = await w.person("member");
  const m = await w.metric(ben, { submission_rule: rule });
  const code = await w.token(m.id, ben);
  const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Export", scopes: ["values:submit"], expiresOn: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) });
  const key = (await actorForKey(secret)) as KeyActor;
  const send = (breakdown: { label: string; value: number; parent?: string | null }[], value = 100) => submitObservation(key, m.slug, { value, breakdown }, quiet());
  const stored = async () => {
    const { data: obs } = await db().from("observations").select("id").eq("metric_id", m.id);
    if (!obs?.length) return [];
    const { data } = await db().from("breakdown_rows").select("id, observation_id, parent_id, label, label_index, value, value_sealed, position").eq("observation_id", obs[0].id).order("position");
    return opened("breakdown_rows", w.id, data ?? [], { dropId: false });
  };
  const read = async () => (await getBreakdowns(w.id, [m.id]))[m.id]?.[month()];
  return { ...w, ben, m, code, key, send, stored, read };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** A row written straight into the table, as anything that is not the core would write it: its id reserved, in the Breakdown of `observation`. */
async function raw(w: Setup, observation: number, label: string, parent: number | null, value = 1) {
  const [id] = await reserveIds("breakdown_rows", 1);
  const cipher = await workspaceCipher(w.id);
  const sealed = cipher.sealing ? { value: null, value_sealed: cipher.seal({ table: "breakdown_rows", column: "value", row: id }, String(value)) } : { value, value_sealed: null };
  const { error } = await db().from("breakdown_rows").insert({ id, observation_id: observation, label: cipher.sealing ? cipher.seal({ table: "breakdown_rows", column: "label", row: id }, label) : label, parent_id: parent, ...sealed });
  return { id, error };
}

const ROWS = [{ label: "Germany", value: 100 }, { label: "Berlin", value: 60, parent: "Germany" }, { label: "Munich", value: 40, parent: "Germany" }, { label: "Austria", value: 50 }];

describe("a Breakdown with parents", () => {
  it("records each part under its parent, whatever the order of the list, and reads back as a tree", async () => {
    const w = await setup();
    // A part before its parent in the list: names are read after the whole list.
    const r = await w.send([ROWS[1], ROWS[3], ROWS[0], ROWS[2]], 150);
    expect(r).toMatchObject({ ok: true });
    const rows = await w.stored();
    expect(rows).toHaveLength(4);
    const idOf = (label: string) => rows.find((x) => x.label === label)!.id;
    expect(Object.fromEntries(rows.map((x) => [x.label, x.parent_id]))).toEqual({ Germany: null, Austria: null, Berlin: idOf("Germany"), Munich: idOf("Germany") });
    // Parents are written before their parts.
    expect(rows.findIndex((x) => x.label === "Germany")).toBeLessThan(rows.findIndex((x) => x.label === "Berlin"));
    // A Breakdown is read as its top-level rows, each with its parts: a flat view never counts a part twice.
    expect(await w.read()).toEqual([{ label: "Austria", value: 50 }, { label: "Germany", value: 100, parts: [{ label: "Berlin", value: 60 }, { label: "Munich", value: 40 }] }]);
  });

  it("takes a pasted spreadsheet with a parent column, and adds up only the top rows for the value", async () => {
    const w = await setup();
    const r = await submitValue({ source: "web_form", sender: w.code, text: "Name\tValue\tParent\nGermany\t100\t\nBerlin\t60\tGermany\nMunich\t40\tgermany\nAustria\t50\t" }, quiet());
    expect(r).toMatchObject({ ok: true });
    const { data } = await db().from("observations").select("id, value, value_sealed").eq("metric_id", w.m.id);
    expect(await opened("observations", w.id, data ?? [], { dropId: true })).toMatchObject([{ value: 150 }]);
    expect((await w.read())!.map((x) => [x.label, x.value, x.parts?.length ?? 0])).toEqual([["Germany", 100, 2], ["Austria", 50, 0]]);
  });

  it("refuses in words, records nothing, and says what is wrong (cycle, own parent, unknown, another name twice, too deep, too big)", async () => {
    const w = await setup();
    const refusals: [string, { label: string; value: number; parent?: string }[], RegExp][] = [
      ["a cycle", [{ label: "A", value: 1, parent: "B" }, { label: "B", value: 1, parent: "C" }, { label: "C", value: 1, parent: "A" }], /among its own parents/],
      ["its own parent", [{ label: "A", value: 1, parent: "a" }, { label: "B", value: 1 }], /its own parent/],
      ["a parent that is no row", [{ label: "A", value: 1, parent: "Elsewhere" }, { label: "B", value: 1 }], /no row of the breakdown has that name/],
      ["the total as a parent", [{ label: "A", value: 1, parent: "Total" }, { label: "B", value: 1 }], /total is not a row/],
      ["a name twice", [{ label: "A", value: 1 }, { label: "a ", value: 1, parent: "A" }], /two rows/],
      ["five levels", ["A", "B", "C", "D", "E"].map((label, i, all) => ({ label, value: 1, ...(i ? { parent: all[i - 1] } : {}) })), /5 levels down/],
      ["a control character", [{ label: "A\u0007", value: 1 }, { label: "B", value: 1, parent: "A" }], /not text/],
    ];
    for (const [name, rows, words] of refusals) {
      const r = await w.send(rows);
      expect(r, name).toMatchObject({ ok: false, reason: "refused" });
      expect((r as { detail: string }).detail, name).toMatch(words);
    }
    // Nothing of any of them was recorded.
    expect(await w.stored()).toEqual([]);
    expect((await db().from("observations").select("id").eq("metric_id", w.m.id)).data).toEqual([]);
  });

  it("holds the limits one step either side: four levels and 200 rows are fine, five levels and 201 rows are refused", async () => {
    const w = await setup("overwrite");
    const four = ["A", "B", "C", "D"].map((label, i, all) => ({ label, value: 1, ...(i ? { parent: all[i - 1] } : {}) }));
    expect(await w.send(four)).toMatchObject({ ok: true });
    expect((await w.stored()).length).toBe(4);
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Row ${i}`, value: 1, ...(i ? { parent: "Row 0" } : {}) }));
    expect(await w.send(rows(200))).toMatchObject({ ok: true });
    expect((await w.stored()).length).toBe(200);
    expect(await w.send(rows(201))).toMatchObject({ ok: false });
    // The refused list left the 200 rows of the one before as they were.
    expect((await w.stored()).length).toBe(200);
    expect(await w.send(["A", "B", "C", "D", "E"].map((label, i, all) => ({ label, value: 1, ...(i ? { parent: all[i - 1] } : {}) })))).toMatchObject({ ok: false });
    expect((await w.stored()).length).toBe(200);
    // A flat Breakdown keeps its older, larger limit: 300 rows without parents are as they were.
    expect(await w.send(Array.from({ length: 300 }, (_, i) => ({ label: `Flat ${i}`, value: 1 })))).toMatchObject({ ok: true });
    expect((await w.stored()).length).toBe(300);
  });

  it("adds to a period under the rule add: a row keeps its place, a new part goes under an old row, another parent is refused", async () => {
    const w = await setup("add");
    await w.send(ROWS, 150);
    // A second value adds to the same rows; naming the parent it already has is the same place.
    expect(await w.send([{ label: "Berlin", value: 5, parent: "Germany" }, { label: "Germany", value: 5 }], 10)).toMatchObject({ ok: true });
    // A new part under an old row: the list must hold the parent too (a list stands on its own).
    expect(await w.send([{ label: "Germany", value: 1 }, { label: "Hamburg", value: 1, parent: "Germany" }], 1)).toMatchObject({ ok: true });
    const rows = await w.stored();
    const germany = rows.find((x) => x.label === "Germany")!;
    expect(rows.map((x) => [x.label, x.value, x.parent_id === germany.id ? "Germany" : x.parent_id])).toEqual([["Germany", 106, null], ["Austria", 50, null], ["Berlin", 65, "Germany"], ["Munich", 40, "Germany"], ["Hamburg", 1, "Germany"]]);
    // A row that is there under a parent cannot be added to without naming it (its value would be counted at the top).
    expect(await w.send([{ label: "Berlin", value: 1 }], 1)).toMatchObject({ ok: false });
    // A row that is there under Germany cannot be added to as a part of Austria, and a top row cannot become a part.
    expect(await w.send([{ label: "Austria", value: 1 }, { label: "Berlin", value: 1, parent: "Austria" }], 2)).toMatchObject({ ok: false });
    expect(await w.send([{ label: "Germany", value: 1 }, { label: "Austria", value: 1, parent: "Germany" }], 2)).toMatchObject({ ok: false });
    expect((await w.stored()).map((x) => x.value)).toEqual([106, 50, 65, 40, 1]);
    // Past four levels with the rows already there is refused in words too, not by the database's error.
    expect(await w.send([{ label: "Hamburg", value: 1 }, { label: "Altona", value: 1, parent: "Hamburg" }, { label: "Ottensen", value: 1, parent: "Altona" }, { label: "Ottensen 2", value: 1, parent: "Ottensen" }], 4)).toMatchObject({ ok: false });
    expect((await w.stored()).length).toBe(5);
  });

  it("tells a sender who may not read the Breakdown nothing of the rows already there: every refusal that depends on them reads the same", async () => {
    const w = await setup("add");
    await w.send(ROWS, 150);
    // The key may only submit. A row that sits elsewhere, a fifth level counted with the rows there, and the same as the first with other names.
    const causes = [
      [{ label: "Austria", value: 1 }, { label: "Berlin", value: 1, parent: "Austria" }],
      [{ label: "Austria", value: 1 }, { label: "Berlin", value: 1, parent: "Austria" }, { label: "Anything", value: 1, parent: "Berlin" }],
      [{ label: "Munich", value: 1, parent: "Munich" }, { label: "Z", value: 1 }],
      [{ label: "Munich", value: 1 }, { label: "A", value: 1, parent: "Munich" }, { label: "B", value: 1, parent: "A" }, { label: "C", value: 1, parent: "B" }],
    ];
    const answers = [];
    for (const rows of causes.slice(0, 2).concat(causes.slice(3))) answers.push(await w.send(rows, 1));
    for (const a of answers) expect(a).toMatchObject({ ok: false, reason: "refused", detail: "These rows cannot be added to this Breakdown." });
    // No name or number of the stored rows is in any answer.
    expect(JSON.stringify(answers)).not.toMatch(/Berlin|Germany|Munich|Austria|\d/);
    // A refusal made of the sent rows alone is still told in its words.
    expect(await w.send(causes[2], 1)).toMatchObject({ ok: false, detail: expect.stringContaining("its own parent") });
  });

  it("the overwrite rule replaces the rows with their parts; deleting a row deletes its parts", async () => {
    const w = await setup("overwrite");
    await w.send(ROWS, 150);
    await w.send([{ label: "Only", value: 1 }, { label: "Part", value: 1, parent: "Only" }], 1);
    expect((await w.stored()).map((x) => x.label)).toEqual(["Only", "Part"]);
    const [only] = await w.stored();
    await db().from("breakdown_rows").delete().eq("id", only.id);
    expect(await w.stored()).toEqual([]);
  });

  it("a Feed's item takes parents and is refused in words as a program is", async () => {
    // The same reader sits in the one place every way in goes through, so a Feed's batch needs no code of its own.
    const w = await setup();
    expect(await w.send([{ label: "A", value: 1, parent: "Nope" }, { label: "B", value: 1 }])).toMatchObject({ ok: false });
  });
});

describe("the database holds the same rules as the core, whatever writes the row", () => {
  it("refuses a parent from another Breakdown, another Workspace, itself, a cycle, a sixth level and a 201st row, as the core does", async () => {
    const w = await setup("keep_both");
    await w.send([{ label: "A", value: 1 }, { label: "B", value: 1 }], 2);
    await w.send([{ label: "C", value: 1 }, { label: "D", value: 1 }], 2);
    const { data: obs } = await db().from("observations").select("id").eq("metric_id", w.m.id).order("id");
    const [one, two] = obs!.map((o) => Number(o.id));
    const first = (await db().from("breakdown_rows").select("id, label").eq("observation_id", one).order("position")).data!;
    const second = (await db().from("breakdown_rows").select("id").eq("observation_id", two).order("position")).data!;

    // Another Breakdown's row as the parent: refused by the foreign key and by the guard. The core cannot name one (a name reaches only its own list).
    expect((await raw(w, one, "X", Number(second[0].id))).error?.message).toMatch(/same Breakdown|violates foreign key/);
    // Another Workspace's row.
    const other = await setup();
    await other.send([{ label: "Foreign", value: 1 }, { label: "Foreign 2", value: 1 }], 2);
    const foreign = (await db().from("breakdown_rows").select("id").eq("workspace_id", other.id)).data!;
    expect((await raw(w, one, "Y", Number(foreign[0].id))).error).not.toBeNull();
    // Its own parent: by the check constraint (an insert with a parent_id equal to its own id).
    const [self] = await reserveIds("breakdown_rows", 1);
    expect((await db().from("breakdown_rows").insert({ id: self, observation_id: one, label: "Self", value: 1, parent_id: self })).error).not.toBeNull();
    expect(readParents([{ label: "Self", parent: "Self" }]).ok).toBe(false);

    // A cycle through an update: A under B under A.
    const a = Number(first[0].id);
    const b = (await raw(w, one, "B2", a)).id;
    expect((await db().from("breakdown_rows").update({ parent_id: b }).eq("id", a)).error?.message).toMatch(/own ancestor/);
    expect(readParents([{ label: "A", parent: "B2" }, { label: "B2", parent: "A" }]).ok).toBe(false);

    // Four levels fit, the fifth does not: A > B2 > C2 > D2 > E2.
    const c = await raw(w, one, "C2", b);
    const d = await raw(w, one, "D2", c.id);
    expect(c.error ?? d.error).toBeNull();
    const e = await raw(w, one, "E2", d.id);
    expect(e.error?.message).toMatch(/at most 4 levels/);
    expect(readParents(["A", "B2", "C2", "D2", "E2"].map((label, i, all) => ({ label, parent: i ? all[i - 1] : undefined }))).ok).toBe(false);
    // Moving a row with parts under a part so that its parts would be a sixth level deep is refused too.
    const lonely = (await raw(w, one, "Lonely", null)).id;
    expect((await raw(w, one, "Lonely part", lonely)).error).toBeNull();
    expect((await db().from("breakdown_rows").update({ parent_id: d.id }).eq("id", lonely)).error?.message).toMatch(/at most 4 levels/);

    // The 201st row of a Breakdown with parents is refused; a flat Breakdown is not held to 200.
    const have = (await db().from("breakdown_rows").select("id", { count: "exact", head: true }).eq("observation_id", one)).count ?? 0;
    for (let i = have; i < 200; i++) expect((await raw(w, one, `Fill ${i}`, null)).error).toBeNull();
    expect((await raw(w, one, "One too many", null)).error?.message).toMatch(/at most 200 rows/);
    expect(readParents(Array.from({ length: 201 }, (_, i) => ({ label: `R${i}`, parent: i ? "R0" : undefined }))).ok).toBe(false);
    expect((await raw(w, two, "Flat 1", null)).error).toBeNull();
  });
});
