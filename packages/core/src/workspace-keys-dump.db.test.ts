// The dump test (spec 0028 step 2, ticket #248; GLOSSARY: Workspace Key): a Workspace is filled through the core with
// words and numbers nobody could guess and they are written down, with a control that is not sealed. CI then dumps the
// whole test database and searches it for them (.github/scripts/dump-test.mjs): a hit in anything but the control
// fails the build, the control missing means the search is broken. The Workspace is left in the database on purpose,
// so this runs only where a dump follows (DUMP_NEEDLES_FILE set: CI's own step, in every shard) and a ZIFFR_SECRETS_KEY is set.
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { db } from "./db";
import { createDashboard, placeWidget, saveDashboardText } from "./dashboards";
import { createMetric, saveSeriesRows } from "./metrics";
import { ask, reply } from "./questions";
import { takeSnapshot } from "./snapshots";
import { createViewLink } from "./view-links";
import { submitValue } from "./submissions";
import { addContact } from "./team";
import { saveWorkflow } from "./workflows";
import { workspace } from "./test/db-fixtures";

const file = process.env.DUMP_NEEDLES_FILE ?? null;
const on = Boolean(file && process.env.ZIFFR_SECRETS_KEY);

describe.skipIf(!on)("the dump", () => {
  it("of a sealed Workspace holds none of its words and numbers", async () => {
    const w = await workspace("DumpControl Quartzhollow Station");
    const owner = await w.person("owner");
    const helper = await w.person("member");
    const actor = w.actor(owner);
    const needles: { text: string; what: string }[] = [];
    // A tag of this run, so rows an earlier run left in a database of your own are not mistaken for this run's.
    const tag = randomUUID().slice(0, 8);
    const known = (text: string, what: string) => { const t = /^[\d.]+$|@/.test(text) ? text : `${text} ${tag}`; needles.push({ text: t, what }); return t; };

    const created = await createMetric(actor, {
      name: known("Vermilion Lighthouse Footfall", "a Metric's name"), description: known("Counted at the Obsidian Pier gate", "a Metric's description"),
      period: "month", submissionRule: "add", targetMin: Number(known("61827.43", "a Target Range")), targetMax: Number(known("77701.125", "a Target Range")), sources: ["api"], submitters: [owner],
    });
    const { data: tokens } = await db().from("tokens").select("code").eq("metric_id", created.id).eq("submitter_id", owner);
    const code = tokens![0].code as string;
    const put = (value: number, period: string, breakdown?: { label: string; value: number }[]) =>
      submitValue({ source: "api", sender: code, text: "", period, value: { value, ...(breakdown ? { breakdown } : {}) } }, { notifyCorrection: async () => {}, afterValue: async () => [] });
    known("73910462.58", "a value");
    await put(73910462.58, "2026-08-01", [{ label: known("Tamarind Wharf", "a Breakdown label"), value: Number(known("31807.25", "a Breakdown value")) }]);
    await put(3377.0625, "2026-09-01");
    known("3377.0625", "a first value of a period");
    // Added to: the sum is a new value, the old one stays in the history of the row.
    await put(88104.375, "2026-09-01");
    known("88104.375", "a value added");
    known("91481.4375", "an added-up value");
    await saveSeriesRows(actor, created.id, "target", [{ period: "2026-10-01", value: Number(known("55512.875", "a Target point")) }], "");
    await saveSeriesRows(actor, created.id, "projection", [{ period: "2026-10-01", value: Number(known("40404.0625", "a Projection point")) }], "");

    const id = await ask(actor, { metricId: created.id, period: "2026-08-01", assigneeId: helper, text: known("Why did Gulliver Quay close early?", "a Question") });
    await reply(w.actor(helper, "member"), id, known("Because of the Saffron Pier storm", "a Thread reply"), null);
    await addContact(actor, { name: known("Percival Underhill-Quince", "a Contact's name"), email: known(`percival.underhill.${tag}@quincefield.example`, "a Contact's address") });
    await saveWorkflow(actor, null, "Close", { dueWorkingDays: 2, steps: [{ type: "check", changePct: 437, outsideTarget: false }, { type: "publish", lock: false }] });
    needles.push({ text: '"changePct": 437', what: "a Check percentage" });

    const dash = await createDashboard(actor, "Harbour overview");
    await saveDashboardText(actor, dash, { intro: known("Sandpiper Cove had a calm month.", "a dashboard introduction") });
    await placeWidget(actor, dash, { type: "spec", template: "story", metricIds: [created.id], settings: { headline: known("Heron counts held steady", "a Finding's headline"), panels: [] } });
    await takeSnapshot(actor, dash, { kind: "month", start: "2026-08-01" });
    // A frozen View Link keeps the numbers as they are now.
    await createViewLink(actor, "dashboard", dash, { label: "For the harbour board", expires: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10), frozen: true });

    // The control: not sealed, so the dump must hold it.
    writeFileSync(file!, JSON.stringify({ control: "Quartzhollow", needles }, null, 2));
    expect(needles.length).toBeGreaterThan(15);
  });
});
