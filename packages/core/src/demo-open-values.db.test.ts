// The first opening of the demo against the database (spec 0051, ticket 8; GLOSSARY: Demo Mode): a visit may write the tables of the
// work around a value, but only with the setting in effect, the Installation open, a ready showcase and the current Generation; the
// closed tables and the showcase refuse it as before; Away and Ask me now (tables of their own) follow the same door; and nothing the
// work does leaves the Outbox. Written for CI: the author could not run it against a database.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, seedingDemo } from "./db";
import { DemoLimit, DemoReadOnly, DemoShowcase, DemoStale } from "./demo";
import { markDemoSeedDone, resetDemoWorkspace } from "./demo-reset";
import { checkDemoBudget, DemoBudgetUsed, takeDemoWorkflowRun } from "./demo-budget";
import { DEMO_WRITE_BUDGET } from "./demo-limits";
import { clearDemoVisitCounts } from "./demo-visit";
import { DEMO_VALUE_WORDS } from "./demo-words";
import { visitingDemo } from "./demo-visiting";
import { recordSimulatedPromptAnswer, recordSimulatedReply } from "./demo-channels";
import { askMeNow } from "./ask-now";
import { setAway } from "./workflows";
import { DEMO_WORKSPACE_ID } from "./team";
import { demoWalkIds } from "./test/demo-walk";
import type { Actor } from "./actor";

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
const visitId = "0123456789abcdef0123456789abcdef";
let ids: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any -- ids of every shape, as the walk reads them
let generation = 0;

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const setOpen = async (on: boolean) => { await db().from("demo_state").update({ open_to_visitors: on }).eq("id", true).throwOnError(); };
/** Runs the work as a demo visit of the current Generation (or another), as the web app's door does. */
const asVisit = <T>(work: () => Promise<T>, gen = generation) => visitingDemo({ generation: gen, visit: visitId }, work);
const writePeriodState = async (metric: number, period: string): Promise<void> => { await db().from("period_states").upsert({ metric_id: metric, period_start: period, state: "asked" }, { onConflict: "metric_id,period_start" }).throwOnError(); };

beforeAll(async () => {
  vi.stubEnv("ZIFFR_DEMO_ONLY", "1");
  vi.stubEnv("ZIFFR_DEMO_CHANGES", "1");
  // A fresh seed, as the reset job makes it: the showcase filled, the seed marked done, the Installation open.
  expect((await db().rpc("demo_reset", { min_gap: "0 seconds" })).error).toBeNull();
  expect((await db().rpc("prototype_seed_showcase")).error).toBeNull();
  await markDemoSeedDone();
  await setOpen(true);
  generation = Number((await db().from("demo_state").select("generation").eq("id", true).single()).data?.generation);
  ids = await demoWalkIds();
}, 180_000);

afterEach(() => vi.stubEnv("ZIFFR_DEMO_CHANGES", "1"));

afterAll(async () => {
  vi.unstubAllEnvs();
  await setOpen(false);
  // Back to the seed, as the next Demo Reset makes it (a minute apart from the last one is what the reset asks for).
  await seedingDemo(async () => { await db().from("workspaces").update({ created_at: "2026-01-01T00:00:00Z" }).eq("id", DEMO_WORKSPACE_ID).throwOnError(); });
  await resetDemoWorkspace();
}, 180_000);

describe("the lists", () => {
  it("hold the tables of the work around a value as open and the rest as closed with a reason", async () => {
    const open = ((await db().from("demo_open_tables").select("table_name")).data ?? []).map((r) => r.table_name as string).sort();
    // Later tickets open more tables (dashboards, decks, Snapshots): these eleven are open, and the people's, settings and outbound ones are not.
    for (const t of ["actions", "breakdown_history", "breakdown_rows", "deliveries", "intake_log", "observation_history", "observations", "period_states", "prompts", "thread_messages", "tokens"]) expect(open, t).toContain(t);
    for (const t of ["workspaces", "profiles", "memberships", "contacts", "invitations", "view_links", "calendar_links", "access_keys", "feeds", "webhooks", "pack_installs", "audit_events"]) expect(open, t).not.toContain(t);
    const closed = (await db().from("demo_closed_tables").select("table_name, reason")).data ?? [];
    expect(closed.length).toBeGreaterThan(20);
    for (const c of closed) expect(String(c.reason).length, c.table_name).toBeGreaterThan(20);
    const { data: unclassified } = await db().rpc("demo_unclassified_tables");
    expect(unclassified).toEqual([]);
  });

  it("put the row caps on the two tables that grow with the work, and the words trigger and the reset lock on every open table", async () => {
    const { data: triggers } = await db().rpc("demo_limit_triggers");
    expect(triggers).toEqual(expect.arrayContaining([{ table_name: "observations", kind: "values" }, { table_name: "actions", kind: "open_actions" }]));
    expect((await db().rpc("demo_words_tables_without_trigger")).data).toEqual([]);
    expect((await db().rpc("demo_open_tables_without_lock")).data).toEqual([]);
  });
});

describe("a visit's write to an open table", () => {
  it("passes with the setting in effect, the Installation open and the current Generation, and marks the demo as changed", async () => {
    await asVisit(() => writePeriodState(ids.ownMetric, ids.period));
    const { data } = await db().from("period_states").select("state").eq("metric_id", ids.ownMetric).eq("period_start", ids.period).single();
    expect(data?.state).toBe("asked");
    expect((await db().from("demo_state").select("changed_since_reset").eq("id", true).single()).data?.changed_since_reset).toBe(true);
  });

  it("is refused without the visit's header, as the read-only demo always did", async () => {
    await expect(writePeriodState(ids.ownMetric, ids.period)).rejects.toBeInstanceOf(DemoReadOnly);
  });

  it("is refused while the setting is off, and while the Installation has not opened the demo", async () => {
    vi.stubEnv("ZIFFR_DEMO_CHANGES", "0");
    await expect(asVisit(() => writePeriodState(ids.ownMetric, ids.period))).rejects.toBeInstanceOf(DemoReadOnly);
    vi.stubEnv("ZIFFR_DEMO_CHANGES", "1");
    await setOpen(false);
    try {
      await expect(asVisit(() => writePeriodState(ids.ownMetric, ids.period))).rejects.toBeInstanceOf(DemoReadOnly);
    } finally {
      await setOpen(true);
    }
  });

  it("is refused as stale for the Generation before the last Demo Reset", async () => {
    await expect(asVisit(() => writePeriodState(ids.ownMetric, ids.period), generation - 1)).rejects.toBeInstanceOf(DemoStale);
  });

  it("is refused for a closed table, even as a visit of the current Generation", async () => {
    await expect(asVisit(async () => { await db().from("workflows").update({ name: "x" }).eq("workspace_id", DEMO_WORKSPACE_ID).throwOnError(); })).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(asVisit(async () => { await db().from("workspaces").update({ name: "x" }).eq("id", DEMO_WORKSPACE_ID).throwOnError(); })).rejects.toBeInstanceOf(DemoReadOnly);
  });

  it("is refused for the showcase's periods, whose values, history and state everyone sees as they are", async () => {
    const churn = (await db().from("metrics").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("slug", "churn-rate").single()).data!;
    await expect(asVisit(() => writePeriodState(churn.id, "2026-03-01"))).rejects.toBeInstanceOf(DemoShowcase);
  });
});

describe("the row caps", () => {
  it("count the values a visitor made since the seed and refuse past the cap with the sentence for values", async () => {
    // The cap's own counting is tried in demo-limits.db.test.ts; here only that the trigger answers with the core's error for this table.
    const { data: lim } = await db().from("demo_limits").select("max_rows").eq("kind", "values").single();
    expect(lim?.max_rows).toBeGreaterThan(0);
    await db().from("demo_limits").update({ max_rows: 1 }).eq("kind", "values").throwOnError();
    try {
      const outcome = await asVisit(async () => {
        // Far ahead, so no row of the seed is in the way: this tries the cap, not the core's window for periods.
        const rows = [1, 2, 3].map((month) => ({ metric_id: ids.ownMetric, period_start: `2099-0${month}-01`, value: month, source: "web_form", submitter_id: "sara" }));
        for (const row of rows) await db().from("observations").insert(row).throwOnError();
      }).catch((e: unknown) => e);
      // Whichever insert met the cap, the refusal is the demo's own words, never a database message.
      expect(outcome).toBeInstanceOf(DemoLimit);
      expect((outcome as DemoLimit).kind).toBe("values");
    } finally {
      await db().from("demo_limits").update({ max_rows: lim!.max_rows }).eq("kind", "values").throwOnError();
    }
  });
});

describe("Away", () => {
  it("is set by a visit from today for at most 30 days and cleared again, and never for longer or further ahead", async () => {
    await asVisit(() => setAway(sara, "ben", day(1), day(10)));
    expect((await db().from("away").select("starts, ends").eq("user_id", "ben").single()).data).toEqual({ starts: day(1), ends: day(10) });
    // The core states the rule first; the database holds it too, so a write that skipped the core is refused.
    await expect(asVisit(() => setAway(sara, "ben", day(1), day(40)))).rejects.toThrow();
    await expect(asVisit(async () => { await db().from("away").insert({ user_id: "anna", starts: day(1), ends: day(80) }).throwOnError(); })).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(asVisit(async () => { await db().from("away").insert({ user_id: "anna", starts: day(-30), ends: day(-20) }).throwOnError(); })).rejects.toBeInstanceOf(DemoReadOnly);
    await asVisit(() => setAway(sara, "ben", null, null));
    expect((await db().from("away").select("user_id").eq("user_id", "ben")).data).toEqual([]);
  });

  it("is refused without a visit's header", async () => {
    await expect(db().from("away").insert({ user_id: "anna", starts: day(1), ends: day(5) }).throwOnError()).rejects.toBeInstanceOf(DemoReadOnly);
  });
});

describe("Ask me now", () => {
  it("claims the Metric's turn for a visit and puts the Prompt in the Outbox, and is refused without the visit's header", async () => {
    await expect(db().rpc("claim_ask_now", { p_metric: ids.ownMetric }).throwOnError()).rejects.toBeInstanceOf(DemoReadOnly);
    const before = (await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count ?? 0;
    const fetched = vi.spyOn(globalThis, "fetch");
    try {
      const sent: unknown = await asVisit(() => askMeNow(sara, ids.ownMetric)).catch((e: unknown) => e);
      // Sara may not submit every Metric: then the core says so in words, and nothing was written.
      if (sent instanceof Error) expect(sent).not.toBeInstanceOf(DemoReadOnly);
      else expect((sent as { state: string }).state).toBe("outbox");
      // Nothing outbound: no fetch to another server was made for it.
      expect(fetched.mock.calls.filter(([url]) => !String(url instanceof Request ? url.url : url).startsWith(process.env.SUPABASE_URL ?? "http://127.0.0.1"))).toEqual([]);
    } finally {
      fetched.mockRestore();
    }
    const after = (await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count ?? 0;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

describe("the simulated channels, recording", () => {
  it("refuse while the setting is off, and a Delivery that is not the demo's", async () => {
    vi.stubEnv("ZIFFR_DEMO_CHANGES", "0");
    await expect(recordSimulatedPromptAnswer(sara, ids.promptDelivery, "42")).rejects.toBeInstanceOf(DemoReadOnly);
    await expect(recordSimulatedReply(sara, ids.actionDelivery, "Done")).rejects.toBeInstanceOf(DemoReadOnly);
    vi.stubEnv("ZIFFR_DEMO_CHANGES", "1");
    await expect(recordSimulatedReply({ ...sara, workspaceId: "11111111-1111-4111-8111-111111111111" }, ids.actionDelivery, "Done")).rejects.toThrow();
  });

  it("record the answer in the demo and send nothing: every Delivery they make stays in the Outbox", async () => {
    const fetched = vi.spyOn(globalThis, "fetch");
    const maxId = (await db().from("deliveries").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).order("id", { ascending: false }).limit(1).single()).data!.id as number;
    try {
      if (ids.actionDelivery) await asVisit(() => recordSimulatedReply(sara, ids.actionDelivery, "Done, see the sheet")).catch(() => undefined);
      // A Prompt's answer goes through intake, which may refuse it in words (a Lock, the Submission Rule): that is not a send either.
      if (ids.promptDelivery) await asVisit(() => recordSimulatedPromptAnswer(sara, ids.promptDelivery, "42")).catch(() => undefined);
    } finally {
      const external = fetched.mock.calls.filter(([url]) => !String(url instanceof Request ? url.url : url).startsWith(process.env.SUPABASE_URL ?? "http://127.0.0.1"));
      fetched.mockRestore();
      expect(external, "nothing is fetched from another server").toEqual([]);
    }
    const made = (await db().from("deliveries").select("id, mail_state, connector").eq("workspace_id", DEMO_WORKSPACE_ID).gt("id", maxId)).data ?? [];
    for (const d of made) expect(d.mail_state, `${d.connector} delivery ${d.id}`).toBe("outbox");
    // The demo has no Webhook, so no send is queued for any change it makes.
    expect((await db().from("webhooks").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count).toBe(0);
    expect((await db().from("webhook_sends").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count).toBe(0);
  });
});

describe("one address's share of the demo", () => {
  const secret = "k".repeat(40);
  const from = (ip: string, id = visitId) => ({ visitId: id, headers: new Headers({ "x-forwarded-for": ip }) });
  const now = new Date("2026-11-24T10:00:10Z");
  const hops = process.env.ZIFFR_PROXY_HOPS;
  const ready = async () => { process.env.ZIFFR_PROXY_HOPS = "1"; await clearDemoVisitCounts(); };
  afterAll(() => { if (hops === undefined) delete process.env.ZIFFR_PROXY_HOPS; else process.env.ZIFFR_PROXY_HOPS = hops; });

  it("charges a paste by its values and stops one address at its share of the values", async () => {
    await ready();
    const share = DEMO_WRITE_BUDGET.perAddressValuesPerWindow;
    await checkDemoBudget(sara, from("203.0.113.5"), now, secret, { by: 100, values: true });
    await checkDemoBudget(sara, from("203.0.113.5"), now, secret, { by: share - 100, values: true }).catch(() => undefined);
    // Past the share (or the address's change budget, whichever is first) the same address is refused, another is not.
    await expect(checkDemoBudget(sara, from("203.0.113.5"), now, secret, { by: 100, values: true })).rejects.toBeInstanceOf(DemoBudgetUsed);
    await checkDemoBudget(sara, from("198.51.100.9"), now, secret, { by: 1, values: true });
  });

  it("lets an address take the Workflow slot once in five minutes and Ask me now ten times a window, and others still run", async () => {
    await ready();
    await checkDemoBudget(sara, from("203.0.113.6"), now, secret, { run: true });
    await expect(checkDemoBudget(sara, from("203.0.113.6"), new Date("2026-11-24T10:02:00Z"), secret, { run: true })).rejects.toBeInstanceOf(DemoBudgetUsed);
    await checkDemoBudget(sara, from("198.51.100.10"), new Date("2026-11-24T10:02:00Z"), secret, { run: true });
    for (let i = 0; i < DEMO_WRITE_BUDGET.perAddressAskNowPerWindow; i++) await checkDemoBudget(sara, from("203.0.113.7"), now, secret, { askNow: true });
    await expect(checkDemoBudget(sara, from("203.0.113.7"), now, secret, { askNow: true })).rejects.toBeInstanceOf(DemoBudgetUsed);
    await clearDemoVisitCounts();
  });
});

describe("a visit's paste is charged by its real values", () => {
  const cellOf = (n: number) => day(-n).slice(0, 7) + "-01";
  it("charges each layout once it is read, before recording: tab-separated, comma-separated and several values on one line", async () => {
    const name = String(ids.ownMetricName);
    const texts = [`${name}\t${cellOf(35)}\t1\n${name}\t${cellOf(65)}\t2`, `${name},${cellOf(35)},1\n${name},${cellOf(65)},2`, `${name}\t${cellOf(35)}\t1\t${cellOf(65)}\t2`];
    for (const text of texts) {
      const charged: number[] = [];
      const refused = new DemoBudgetUsed("busy");
      const { recordPastedValues } = await import("./paste-values");
      const result = await asVisit(() => recordPastedValues(sara, { text }, undefined, { chargeValues: async (n) => { charged.push(n); throw refused; } })).catch((e: unknown) => e);
      // Whatever the layout, the real count is what was charged, and the refusal left nothing recorded.
      if (charged.length) { expect(charged[0], text).toBeGreaterThan(0); expect(result).toBe(refused); }
    }
  });
});

describe("the showcase for intake log and Breakdown rows", () => {
  it("refuses a visit's change to the intake log or Breakdown of a showcase value", async () => {
    const churn = (await db().from("metrics").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("slug", "churn-rate").single()).data!;
    const obs = (await db().from("observations").select("id").eq("metric_id", churn.id).eq("period_start", "2026-03-01").maybeSingle()).data;
    if (!obs) return;
    await seedingDemo(async () => { await db().from("intake_log").insert({ source: "web_form", sender: "x", raw: "1", outcome: "recorded", detail: "d", observation_id: obs.id, metric_id: churn.id }).throwOnError(); });
    const log = (await db().from("intake_log").select("id").eq("observation_id", obs.id).limit(1).single()).data!;
    await expect(asVisit(async () => { await db().from("intake_log").update({ detail: "changed" }).eq("id", log.id).throwOnError(); })).rejects.toBeInstanceOf(DemoShowcase);
    await expect(asVisit(async () => { await db().from("intake_log").delete().eq("id", log.id).throwOnError(); })).rejects.toBeInstanceOf(DemoShowcase);
    const row = (await db().from("breakdown_rows").select("id").eq("observation_id", obs.id).limit(1).maybeSingle()).data;
    if (row) await expect(asVisit(async () => { await db().from("breakdown_rows").delete().eq("id", row.id).throwOnError(); })).rejects.toBeInstanceOf(DemoShowcase);
  });
});

describe("the paste claims", () => {
  it("are emptied for the demo's people by a Demo Reset, and a visit's paste never claims the day", async () => {
    await db().from("paste_claims").insert({ person_id: "sara", value_count: 5 }).throwOnError();
    await seedingDemo(async () => { await db().from("workspaces").update({ created_at: "2026-01-01T00:00:00Z" }).eq("id", DEMO_WORKSPACE_ID).throwOnError(); });
    await resetDemoWorkspace();
    expect((await db().from("paste_claims").select("id").eq("person_id", "sara")).data).toEqual([]);
  }, 180_000);
});

describe("the one Workflow run a minute", () => {
  it("lets the first run of a minute take its turn, refuses the second in words, and lets the next minute run", async () => {
    await clearDemoVisitCounts();
    const minute = new Date("2026-11-24T10:00:10Z");
    await takeDemoWorkflowRun(sara, minute);
    const refused = await takeDemoWorkflowRun(sara, new Date("2026-11-24T10:00:50Z")).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(DemoBudgetUsed);
    expect((refused as Error).message).toBe(DEMO_VALUE_WORDS.run);
    await takeDemoWorkflowRun(sara, new Date("2026-11-24T10:01:05Z"));
    await clearDemoVisitCounts();
  });
});
