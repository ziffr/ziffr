// Putting a Version of a dashboard back (GLOSSARY: Version), without a database: whichever step fails, the dashboard
// keeps its widgets and its words, and it never ends up empty.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Op = "select" | "update" | "delete" | "insert";
/** How a step goes wrong: it answers an error, it throws, or it is done and its answer is lost. */
type Fault = "error" | "throw" | "lost";

const store = vi.hoisted(() => ({ dashboards: [] as Record<string, unknown>[], widgets: [] as Record<string, unknown>[], faults: new Map<string, string[]>() }));

/** The next fault of a step, in the order they were set; none when the step works. */
const faultOf = (table: string, op: Op) => store.faults.get(`${table}:${op}`)?.shift() as Fault | "" | undefined;

vi.mock("./db", () => ({
  db: () => ({
    from: (table: "dashboards" | "widgets") => {
      let op: Op = "select";
      let patch: Row = {};
      let one = false;
      const filters: ((r: Row) => boolean)[] = [];
      const run = () => {
        const fault = faultOf(table, op);
        if (fault === "throw") throw new Error("the connection broke");
        if (fault === "error") return { data: null, error: { message: "refused" } };
        const hit = store[table].filter((r) => filters.every((f) => f(r)));
        if (op === "update") for (const r of hit) Object.assign(r, patch);
        if (op === "delete") store[table] = store[table].filter((r) => !hit.includes(r));
        if (fault === "lost") return { data: null, error: { message: "no answer" } };
        return { data: one ? { ...hit[0] } : hit.map((r) => ({ ...r })), error: null };
      };
      const q = {
        select: () => q,
        update: (p: Row) => { op = "update"; patch = p; return q; },
        delete: () => { op = "delete"; return q; },
        eq: (column: string, value: unknown) => { filters.push((r) => r[column] === value); return q; },
        in: (column: string, values: unknown[]) => { filters.push((r) => values.includes(r[column])); return q; },
        single: () => { one = true; return q; },
        then: (done: (v: unknown) => unknown, failed: (e: unknown) => unknown) => new Promise((resolve) => resolve(run())).then(done, failed),
      };
      return q;
    },
  }),
}));

vi.mock("./sealed-columns", () => ({
  sealedPatch: async (_table: string, _ws: string, _id: number, patch: Row) => patch,
  insertSealed: async (_table: string, ws: string, rows: Row[]) => {
    if (faultOf("widgets", "insert")) throw new Error("It could not be saved.");
    const added = rows.map((r, i) => ({ ...r, id: 100 + i, workspace_id: ws }));
    store.widgets.push(...added);
    return added.map((r) => ({ id: r.id }));
  },
}));

import { replaceDashboard } from "./dashboard-restore";

const WS = "11111111-1111-4111-8111-111111111111";
const words = { name: "As it was", intro: "Old words." };
const restoredWidgets = [{ title: "Restored", dashboard_id: 1 }];
const restore = (widgets: Row[] = restoredWidgets) => replaceDashboard(WS, 1, words, widgets);
const titles = () => store.widgets.filter((w) => w.dashboard_id === 1).map((w) => w.title).sort();
const dashboard = () => ({ name: store.dashboards[0].name, intro: store.dashboards[0].intro });
const unchanged = () => {
  expect(titles()).toEqual(["First", "Second"]);
  expect(dashboard()).toEqual({ name: "Now", intro: "New words." });
};
const fail = (step: `${"dashboards" | "widgets"}:${Op}`, ...faults: (Fault | "")[]) => store.faults.set(step, faults);

beforeEach(() => {
  store.dashboards = [{ id: 1, workspace_id: WS, name: "Now", theme_id: null, intro: "New words." }];
  store.widgets = [
    { id: 1, workspace_id: WS, dashboard_id: 1, title: "First" },
    { id: 2, workspace_id: WS, dashboard_id: 1, title: "Second" },
    { id: 3, workspace_id: WS, dashboard_id: 2, title: "Elsewhere" },
  ];
  store.faults.clear();
});

describe("restoring a dashboard", () => {
  it("replaces its words and widgets, and no other dashboard's", async () => {
    await restore();
    expect(titles()).toEqual(["Restored"]);
    expect(dashboard()).toEqual(words);
    expect(store.widgets.filter((w) => w.dashboard_id === 2)).toHaveLength(1);
  });

  it("may take every widget away, or fill a dashboard that has none", async () => {
    await restore([]);
    expect(titles()).toEqual([]);
    await restore();
    expect(titles()).toEqual(["Restored"]);
  });

  it.each(["widgets:select", "dashboards:select", "widgets:insert"] as const)("changes nothing when %s fails", async (step) => {
    fail(step, "error");
    await expect(restore()).rejects.toThrow();
    unchanged();
  });

  it.each(["error", "throw", "lost"] as const)("changes nothing when writing the words ends in %s", async (fault) => {
    fail("dashboards:update", fault);
    await expect(restore()).rejects.toThrow();
    unchanged();
  });

  it.each(["error", "throw"] as const)("changes nothing when removing the old widgets ends in %s", async (fault) => {
    fail("widgets:delete", fault);
    await expect(restore()).rejects.toThrow();
    unchanged();
  });

  it("keeps the restored dashboard when only the answer to the removal was lost", async () => {
    fail("widgets:delete", "lost");
    await restore();
    expect(titles()).toEqual(["Restored"]);
    expect(dashboard()).toEqual(words);
  });

  it.each(["error", "throw"] as const)("takes nothing away when it cannot tell whether the old widgets went (%s)", async (fault) => {
    fail("widgets:delete", "lost");
    fail("widgets:select", "", fault);
    await expect(restore()).rejects.toThrow("could not be restored");
    expect(titles()).toEqual(["Restored"]);
  });

  it("reports the first failure, and keeps both sets, when taking back fails too", async () => {
    fail("widgets:delete", "error", "throw");
    await expect(restore()).rejects.toThrow("could not be restored");
    expect(titles()).toEqual(["First", "Restored", "Second"]);
  });
});
