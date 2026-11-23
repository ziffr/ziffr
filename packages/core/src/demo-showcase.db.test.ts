// The demo's seeded words and showcase in the database (GLOSSARY: Demo Mode; spec 0051, ticket 6). No table is open to
// visitors yet, so the trigger cannot be reached by a write; what is tried here is its one check, `demo_protected_reason`
// (the trigger only turns its answer into ZF4D3 or ZF4D4), the tables the seed fills after every Demo Reset, and that the
// list in demo-words-columns.ts says what the schema says: a table or text column nobody classified fails here.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { resetDemoWorkspace } from "./demo-reset";
import { DEMO_OPEN_CANDIDATES, DEMO_WORDS_COLUMNS, demoKeptRowTables, demoWordsColumnRows } from "./demo-words-columns";
import { DEMO_WORKSPACE_ID } from "./team";

const TEXTLIKE = new Set(["text", "character varying", "jsonb", "json", "ARRAY", "USER-DEFINED"]);

beforeAll(async () => {
  expect((await db().rpc("demo_reset", { min_gap: "0 seconds" })).error).toBeNull();
  expect((await db().rpc("prototype_seed_showcase")).error).toBeNull();
}, 120_000);

/** The first demo row of a table, as the trigger sees it. */
async function demoRow(table: string, filter: Record<string, string | number> = {}): Promise<Record<string, unknown>> {
  let q = db().from(table).select("*").eq("workspace_id", DEMO_WORKSPACE_ID);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q.limit(1);
  expect(error).toBeNull();
  expect(data?.length, `${table} has no demo row for ${JSON.stringify(filter)}`).toBe(1);
  return data![0] as Record<string, unknown>;
}
const reason = async (op: string, table: string, oldRow: object | null, newRow: object | null) => {
  const { data, error } = await db().rpc("demo_protected_reason", { op, t: table, old_row: oldRow, new_row: newRow });
  expect(error).toBeNull();
  return data as string | null;
};

describe("the classification of the tables a visitor may one day write", () => {
  it("names every text-like column of every candidate table, once, and no column that does not exist", async () => {
    for (const table of DEMO_OPEN_CANDIDATES) {
      const { data, error } = await db().rpc("demo_text_columns", { t: table });
      expect(error).toBeNull();
      const actual = new Set((data as { column_name: string; data_type: string }[]).filter((c) => TEXTLIKE.has(c.data_type)).map((c) => c.column_name));
      const t = DEMO_WORDS_COLUMNS[table];
      const named = new Set([...t.words, ...(t.kept ?? []), ...t.other]);
      const unclassified = [...actual].filter((c) => !named.has(c));
      expect(unclassified, `${table} has text columns nobody classified: add them to demo-words-columns.ts as words, kept or other`).toEqual([]);
      const missing = [...t.words, ...(t.kept ?? [])].filter((c) => !(data as { column_name: string }[]).some((x) => x.column_name === c));
      expect(missing, `${table} lists words columns that are not in the table`).toEqual([]);
    }
  });

  it("is what demo_words_columns and demo_kept_rows hold", async () => {
    const rows = ((await db().from("demo_words_columns").select("table_name, column_name, kind")).data ?? []).map((r) => `${r.table_name}.${r.column_name}.${r.kind}`).sort();
    expect(rows).toEqual(demoWordsColumnRows().map(([t, c, k]) => `${t}.${c}.${k}`).sort());
    const kept = ((await db().from("demo_kept_rows").select("table_name")).data ?? []).map((r) => r.table_name as string).sort();
    expect(kept).toEqual(demoKeptRowTables().sort());
  });

  it("covers every table that is open to visitors", async () => {
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string);
    expect(open.filter((t) => !DEMO_OPEN_CANDIDATES.includes(t)), "a table is open but its words are not classified").toEqual([]);
  });

  it("leaves no table with a words column without the words trigger", async () => {
    const { data, error } = await db().rpc("demo_words_tables_without_trigger");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("what the seed fills after a Demo Reset", () => {
  it("lists the showcase: the landing page's dashboards, the decks, the Weekly numbers Workflow and the examples' periods", async () => {
    const shown = ((await db().from("demo_showcase").select("table_name, row_key")).data ?? []) as { table_name: string; row_key: string }[];
    const names = async (table: string) => ((await db().from(table).select("id, name").eq("workspace_id", DEMO_WORKSPACE_ID)).data ?? []) as { id: number; name: string }[];
    const dashboards = (await names("dashboards")).filter((d) => shown.some((s) => s.table_name === "dashboards" && s.row_key === String(d.id))).map((d) => d.name).sort();
    expect(dashboards).toEqual(["Monthly overview", "October in short", "Weekly numbers"]);
    for (const d of await names("decks")) expect(shown.some((s) => s.table_name === "decks" && s.row_key === String(d.id))).toBe(true);
    expect((await names("workflows")).filter((w) => shown.some((s) => s.table_name === "workflows" && s.row_key === String(w.id))).map((w) => w.name)).toEqual(["Weekly numbers"]);
    const churn = (await db().from("metrics").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("slug", "churn-rate").single()).data!;
    for (const t of ["observations", "observation_history", "period_states"]) expect(shown.some((s) => s.table_name === t && s.row_key === `${churn.id}:2026-03-01`), t).toBe(true);
  });

  it("is made again by every Demo Reset, with the new ids and none of the old", async () => {
    const before = ((await db().from("demo_showcase").select("row_key").eq("table_name", "dashboards")).data ?? []).map((r) => r.row_key as string);
    expect(await resetDemoWorkspace()).toBe(true);
    const after = ((await db().from("demo_showcase").select("row_key").eq("table_name", "dashboards")).data ?? []).map((r) => r.row_key as string);
    expect(after).toHaveLength(3);
    expect(after.filter((k) => before.includes(k))).toEqual([]);
  }, 120_000);

  it("keeps the key tables closed to the core's writes: only the seed function fills them", async () => {
    for (const t of ["demo_showcase", "demo_seeded_rows", "demo_words_columns", "demo_kept_rows"]) {
      expect((await db().from(t).insert({ table_name: "dashboards", row_key: "1", column_name: "x", kind: "words" })).error?.code, t).toBe("42501");
    }
    expect((await db().from("demo_showcase").delete().neq("row_key", "")).error?.code).toBe("42501");
  });
});

describe("the check that the trigger runs", () => {
  it("refuses a change to the name or intro of a dashboard the seed made, and lets the rest of it be changed", async () => {
    const ops = await demoRow("dashboards", { name: "Operations" });
    expect(await reason("UPDATE", "dashboards", ops, { ...ops, name: "Mine" })).toBe("words");
    expect(await reason("UPDATE", "dashboards", ops, { ...ops, intro: "Mine" })).toBe("words");
    expect(await reason("UPDATE", "dashboards", ops, { ...ops, theme_id: null, snapshot_every: "week" })).toBeNull();
  });

  it("refuses deleting what the seed made in a kept table, but not a widget", async () => {
    const ops = await demoRow("dashboards", { name: "Operations" });
    expect(await reason("DELETE", "dashboards", ops, null)).toBe("words");
    const metric = await demoRow("metrics");
    expect(await reason("DELETE", "metrics", metric, null)).toBe("words");
    expect(await reason("UPDATE", "metrics", metric, { ...metric, archived_at: new Date().toISOString() })).toBe("words");
    expect(await reason("UPDATE", "metrics", metric, { ...metric, target_min: 1, sources: ["web_form"] })).toBeNull();
    const dash = await demoRow("dashboards", { name: "Operations" });
    const widget = await demoRow("widgets", { dashboard_id: dash.id as number });
    expect(await reason("DELETE", "widgets", widget, null)).toBeNull();
  });

  it("leaves a row a visitor made to the visitor: any change, and deleting it", async () => {
    const mine = { id: 2_000_000_001, name: "Mine", intro: "mine", workspace_id: DEMO_WORKSPACE_ID };
    expect(await reason("INSERT", "dashboards", null, mine)).toBeNull();
    expect(await reason("UPDATE", "dashboards", mine, { ...mine, name: "Mine, renamed" })).toBeNull();
    expect(await reason("DELETE", "dashboards", mine, null)).toBeNull();
  });

  it("refuses every write that touches a showcase object, and what hangs off it", async () => {
    const monthly = await demoRow("dashboards", { name: "Monthly overview" });
    expect(await reason("UPDATE", "dashboards", monthly, { ...monthly, snapshot_every: "week" })).toBe("showcase");
    expect(await reason("DELETE", "dashboards", monthly, null)).toBe("showcase");
    const widget = await demoRow("widgets", { dashboard_id: monthly.id as number });
    expect(await reason("UPDATE", "widgets", widget, { ...widget, x: 3 })).toBe("showcase");
    expect(await reason("INSERT", "widgets", null, { ...widget, id: 2_000_000_002 })).toBe("showcase");
    expect(await reason("INSERT", "shares", null, { object_type: "dashboard", object_id: monthly.id, user_id: "ben", role: "viewer" })).toBe("showcase");
    // A widget moved onto it from a dashboard of one's own is refused too, by its new row.
    expect(await reason("UPDATE", "widgets", { ...widget, dashboard_id: 2_000_000_003 }, { ...widget, dashboard_id: monthly.id })).toBe("showcase");
    const deck = await demoRow("decks");
    expect(await reason("UPDATE", "decks", deck, { ...deck, document: {} })).toBe("showcase");
  });

  it("refuses a change to the Churn rate of March 2026 and its Thread, and a new reply in it", async () => {
    const churn = await demoRow("metrics", { slug: "churn-rate" });
    const key = { metric_id: churn.id as number, period_start: "2026-03-01" };
    const obs = await demoRow("observations", key);
    expect(await reason("UPDATE", "observations", obs, { ...obs, value: 9 })).toBe("showcase");
    expect(await reason("INSERT", "observations", null, { ...obs, id: 2_000_000_004 })).toBe("showcase");
    const state = await demoRow("period_states", key).catch(() => null);
    if (state) expect(await reason("UPDATE", "period_states", state, { ...state, state: "open" })).toBe("showcase");
    const action = await demoRow("actions", key);
    expect(await reason("INSERT", "actions", null, { ...action, id: 2_000_000_005, question: "Why?" })).toBe("showcase");
    const message = await demoRow("thread_messages", { action_id: action.id as number });
    expect(await reason("UPDATE", "thread_messages", message, { ...message, body: "x" })).toBe("showcase");
    expect(await reason("INSERT", "thread_messages", null, { ...message, id: 2_000_000_006, body: "A reply" })).toBe("showcase");
    // The same Metric in another month is everyone's to change.
    const other = await db().from("observations").select("*").eq("workspace_id", DEMO_WORKSPACE_ID).eq("metric_id", churn.id).neq("period_start", "2026-03-01").limit(1).single();
    expect(await reason("UPDATE", "observations", other.data, { ...other.data, value: 9 })).toBeNull();
  });

  it("refuses the Weekly numbers Workflow and its weeks 46 and 47, and no other Workflow", async () => {
    const weekly = await demoRow("workflows", { name: "Weekly numbers" });
    expect(await reason("UPDATE", "workflows", weekly, { ...weekly, config: {} })).toBe("showcase");
    const other = await demoRow("workflows", { name: "Operations, monthly" });
    expect(await reason("UPDATE", "workflows", other, { ...other, config: {} })).toBeNull();
    expect(await reason("UPDATE", "workflows", other, { ...other, name: "Mine" })).toBe("words");
  });
});
