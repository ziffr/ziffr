// Deleting a Metric through the API: DELETE /api/v1/metrics/{slug}?confirm=<name>, scope metrics:write, as the key's
// creator and only for a Metric they own, with the same refusals as the app; the Audit Log names the key.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { auditLog } from "@ziffr/core/audit-log";
import { deleteMetric } from "@ziffr/core/metrics";
import { getMetrics } from "@ziffr/core/workspace-data";
import { share } from "@ziffr/core/sharing";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { DELETE as remove } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const del = (slug: string, key: string, confirm?: string) =>
  remove(new Request(`http://ziffr.test/api/v1/metrics/${slug}${confirm === undefined ? "" : `?confirm=${encodeURIComponent(confirm)}`}`, { method: "DELETE", headers: { authorization: `Bearer ${key}` } }), { params: Promise.resolve({ slug }) });

describe("deleting a Metric through the API", () => {
  it("needs metrics:write, the exact name and ownership, refuses while in use, and records the key", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ben = await w.person("member"); const sara = await w.person("owner");
    const mine = await w.metric(ben, { name: "Old leads" });
    await w.value(mine.id, "2026-10-01", 3);
    const saras = await w.metric(sara, { name: "Payroll" });
    const shared = await w.metric(sara, { name: "Visits" });
    await share(w.actor(sara), "metric", shared.id, ben, "viewer");
    const reader = (await createAccessKey(w.actor(ben, "member"), { name: "Reader", scopes: ["metrics:read"], expiresOn: inDays(30) })).secret;
    const { secret: key } = await createAccessKey(w.actor(ben, "member"), { name: "Cleanup", scopes: ["metrics:write"], expiresOn: inDays(30) });

    // Without the scope, it is refused like every endpoint (403); without the name, a 400.
    expect((await del(mine.slug, reader, "Old leads")).status).toBe(403);
    expect((await del(mine.slug, key)).status).toBe(400);
    // Hidden from Ben: not found. Seen but not his: forbidden, saying why. A wrong name: nothing deleted.
    expect((await del(saras.slug, key, "Payroll")).status).toBe(404);
    const notMine = await del(shared.slug, key, "Visits");
    expect(notMine.status).toBe(403);
    expect((await notMine.json()).error.message).toMatch(/owner/);
    const wrong = await del(mine.slug, key, "old leads");
    expect(wrong.status).toBe(422);

    // In use by another Metric's formula: refused with the reason.
    const derived = await w.metric(ben, { name: "Twice", formula: `{${mine.slug}} * 2` });
    const used = await del(mine.slug, key, "Old leads");
    expect(used.status).toBe(422);
    expect((await used.json()).error.message).toMatch(/computed from it/);
    await deleteMetric(w.actor(ben, "member"), derived.id, "Twice");

    const ok = await del(mine.slug, key, "Old leads");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ deleted: mine.slug, values: 1 });
    expect((await getMetrics(w.id)).some((x) => x.id === mine.id)).toBe(false);
    // The Audit Log names the key. Ben, made an Admin to read it, sees his own deletion in full; Sara, who never
    // saw the Metric, would get it without its details.
    await w.setRole(ben, "admin");
    const events = (await auditLog(w.actor(ben, "admin"))).events.filter((e) => e.kind === "metric.deleted" && e.objectId === String(mine.id));
    expect(events).toHaveLength(1);
    expect(events[0].details).toMatchObject({ values: 1, key_name: "Cleanup" });
    // Gone: a second call finds nothing.
    expect((await del(mine.slug, key, "Old leads")).status).toBe(404);
  });
});
