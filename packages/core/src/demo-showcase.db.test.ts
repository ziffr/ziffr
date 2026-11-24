// The demo's seeded words and showcase in the database (GLOSSARY: Demo Mode; spec 0051, ticket 6). No table is open to
// visitors yet, so the trigger cannot be reached by a write; what is tried here is its one check, `demo_protected_reason`
// (the trigger only turns its answer into ZF4D3 or ZF4D4), the tables the seed fills after every Demo Reset, and that the
// list in demo-words-columns.ts says what the schema says: a table or text column nobody classified fails here.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { DEMO_OPEN_CANDIDATES, DEMO_WORDS_COLUMNS, demoKeptRowTables, demoWordsColumnRows } from "./demo-words-columns";
import { DEMO_WORKSPACE_ID } from "./team";

const RETIRES = /^(deleted|archived|hidden|retired|removed|shown)(_at|_by)?$/;
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
      // Text-like columns (words may sit in any), and any column that retires a row (archived, deleted, hidden): both must be said.
      const actual = new Set((data as { column_name: string; data_type: string }[]).filter((c) => TEXTLIKE.has(c.data_type) || RETIRES.test(c.column_name)).map((c) => c.column_name));
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

  it("leaves no table with words, and no open table, without the words trigger (the fail-closed check)", async () => {
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
    // The SQL reset and the seed function, as the core's reset runs them (resetDemoWorkspace refuses within a minute of the last).
    expect((await db().rpc("demo_reset", { min_gap: "0 seconds" })).error).toBeNull();
    expect((await db().rpc("prototype_seed_showcase")).error).toBeNull();
    const after = ((await db().from("demo_showcase").select("row_key").eq("table_name", "dashboards")).data ?? []).map((r) => r.row_key as string);
    expect(after).toHaveLength(3);
    expect(after.filter((k) => before.includes(k))).toEqual([]);
  }, 120_000);

  it("keeps the key tables closed to the core's writes: only the seed function fills them", async () => {
    const row: Record<string, Record<string, string>> = {
      demo_showcase: { table_name: "dashboards", row_key: "1" },
      demo_seeded_rows: { table_name: "dashboards", row_key: "1" },
      demo_words_columns: { table_name: "dashboards", column_name: "x", kind: "words" },
      demo_kept_rows: { table_name: "dashboards" },
    };
    for (const [t, values] of Object.entries(row)) expect((await db().from(t).insert(values)).error?.code, t).toBe("42501");
    expect((await db().from("demo_showcase").delete().neq("row_key", "")).error?.code).toBe("42501");
  });
});

describe("the fail-closed flag", () => {
  it("is on after the seed, cleared by every Demo Reset until the seed function has run, and not turnable on by the core", async () => {
    const ready = async () => (await db().from("demo_state").select("showcase_ready").single()).data!.showcase_ready as boolean;
    expect(await ready()).toBe(true);
    expect((await db().rpc("demo_reset", { min_gap: "0 seconds" })).error).toBeNull();
    expect(await ready()).toBe(false);
    // The core can write the row (the flag for the setting), but writing the flag on does nothing.
    await db().from("demo_state").update({ showcase_ready: true }).eq("id", true);
    expect(await ready()).toBe(false);
    expect((await db().rpc("prototype_seed_showcase")).error).toBeNull();
    expect(await ready()).toBe(true);
  }, 120_000);

  it("is turned on once even when two seeders run at once, and only for the Generation they seeded", async () => {
    expect((await db().rpc("demo_reset", { min_gap: "0 seconds" })).error).toBeNull();
    const [a, b] = await Promise.all([db().rpc("prototype_seed_showcase"), db().rpc("prototype_seed_showcase")]);
    expect([a.error, b.error]).toEqual([null, null]);
    const state = (await db().from("demo_state").select("showcase_ready, generation").single()).data!;
    expect(state.showcase_ready).toBe(true);
    const dashboards = ((await db().from("demo_showcase").select("row_key").eq("table_name", "dashboards")).data ?? []).length;
    expect(dashboards).toBe(3);
    // A reset that follows clears the flag again: it cannot stay on for a Generation whose showcase was not recorded.
    expect((await db().rpc("demo_reset", { min_gap: "0 seconds" })).error).toBeNull();
    expect((await db().from("demo_state").select("showcase_ready").single()).data!.showcase_ready).toBe(false);
    expect((await db().rpc("prototype_seed_showcase")).error).toBeNull();
  }, 120_000);

  it("has the showcase records only the seed made: a second call while ready changes nothing", async () => {
    const before = (await db().from("demo_showcase").select("*", { count: "exact", head: true })).count;
    expect((await db().rpc("prototype_seed_showcase")).error).toBeNull();
    expect((await db().from("demo_showcase").select("*", { count: "exact", head: true })).count).toBe(before);
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
    // Any seeded Metric that is not in the showcase (the first row is arbitrary, and the showcase's Metrics are protected as a whole).
    const keep = new Set(((await db().from("demo_showcase").select("row_key").eq("table_name", "metrics")).data ?? []).map((r) => r.row_key as string));
    const plain = ((await db().from("metrics").select("*").eq("workspace_id", DEMO_WORKSPACE_ID).order("id")).data ?? []).find((m) => !keep.has(String(m.id)))!;
    const metric = plain as Record<string, unknown>;
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

  it("refuses a change to the words in a seeded widget's settings, and lets its other settings be changed", async () => {
    const dash = await demoRow("dashboards", { name: "Operations" });
    const widget = await demoRow("widgets", { dashboard_id: dash.id as number });
    const settings = (widget.settings ?? {}) as Record<string, unknown>;
    expect(await reason("UPDATE", "widgets", widget, { ...widget, settings: { ...settings, headline: "Mine" } })).toBe("words");
    expect(await reason("UPDATE", "widgets", widget, { ...widget, settings: { ...settings, canvasSeed: { settings: { headline: "Mine" } } } })).toBe("words");
    expect(await reason("UPDATE", "widgets", widget, { ...widget, settings: { ...settings, color: "red" } })).toBeNull();
  });

  it("refuses a seeded Workflow's config, a Theme's slides and a template's body", async () => {
    const wf = await demoRow("workflows", { name: "Operations, monthly" });
    expect(await reason("UPDATE", "workflows", wf, { ...wf, config: { steps: [] } })).toBe("words");
    // A Theme the showcase does not use (the default and the ones its dashboards and decks use are the showcase's).
    const used = new Set(((await db().from("demo_showcase").select("row_key").eq("table_name", "themes")).data ?? []).map((r) => r.row_key as string));
    const themes = ((await db().from("themes").select("*").eq("workspace_id", DEMO_WORKSPACE_ID)).data ?? []) as Record<string, unknown>[];
    const theme = themes.find((t) => !used.has(String(t.id)));
    if (theme) expect(await reason("UPDATE", "themes", theme, { ...theme, slides: { footer: "x" } })).toBe("words");
  });

  it("refuses to change the key of a row the seed made, so that it cannot hide from the check", async () => {
    const ops = await demoRow("dashboards", { name: "Operations" });
    expect(await reason("UPDATE", "dashboards", ops, { ...ops, id: 2_000_000_009 })).toBe("words");
  });

  it("covers what the showcase depends on: its Metrics, their targets, Prompts, Checklist Tasks, Deliveries, Themes and Versions", async () => {
    const churn = await demoRow("metrics", { slug: "churn-rate" });
    for (const change of [{ polarity: "lower" }, { period: "week" }, { target_min: 1 }, { formula: "1" }, { workflow_id: null }, { decimals: 4 }, { aggregation: "sum" }]) {
      expect(await reason("UPDATE", "metrics", churn, { ...churn, ...change }), JSON.stringify(change)).toBe("showcase");
    }
    const prompt = await demoRow("prompts", { metric_id: churn.id as number, period_start: "2026-03-01" }).catch(() => null);
    if (prompt) expect(await reason("INSERT", "prompts", null, { ...prompt, id: 2_000_000_010 })).toBe("showcase");
    expect(await reason("INSERT", "series_values", null, { metric_id: churn.id, kind: "target", period_start: "2026-03-01" })).toBe("showcase");
    const weekly = await demoRow("workflows", { name: "Weekly numbers" });
    expect(await reason("INSERT", "actions", null, { workflow_id: weekly.id, metric_id: 1, period_start: "2026-01-01", question: "x" })).toBe("showcase");
    const monthly = await demoRow("dashboards", { name: "Monthly overview" });
    expect(await reason("INSERT", "deliveries", null, { snapshot_dashboard_id: monthly.id, subject: "x" })).toBe("showcase");
    if (monthly.theme_id) expect(await reason("UPDATE", "themes", { id: monthly.theme_id }, { id: monthly.theme_id, name: "x" })).toBe("showcase");
    for (const object_type of ["dashboard", "workflow"]) {
      const id = object_type === "dashboard" ? monthly.id : weekly.id;
      expect(await reason("INSERT", "versions", null, { object_type, object_id: id, version: 99 }), object_type).toBe("showcase");
    }
    const widget = await demoRow("widgets", { dashboard_id: monthly.id as number });
    expect(await reason("INSERT", "versions", null, { object_type: "widget", object_id: widget.id, version: 99 })).toBe("showcase");
  });

  it("refuses the Weekly numbers Workflow and its weeks 46 and 47, and no other Workflow", async () => {
    const weekly = await demoRow("workflows", { name: "Weekly numbers" });
    expect(await reason("UPDATE", "workflows", weekly, { ...weekly, config: {} })).toBe("showcase");
    const other = await demoRow("workflows", { name: "Operations, monthly" });
    // Its config holds the text of Checklist Items, so it is the seed's words; what is not words stays a visitor's.
    expect(await reason("UPDATE", "workflows", other, { ...other, config: {} })).toBe("words");
    expect(await reason("UPDATE", "workflows", other, { ...other, owner_id: "ben" })).toBeNull();
    expect(await reason("UPDATE", "workflows", other, { ...other, name: "Mine" })).toBe("words");
  });
});
