// Archiving a Metric and bringing it back through the API (spec 0029, ticket #264): POST /metrics/{slug}/archive and
// /restore with scope metrics:write, as the key's creator, for Owners, Admins and the Metric's owner; GET /metrics
// lists Archived Metrics only with ?archived=true; a value sent to one is refused.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { share } from "@ziffr/core/sharing";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { POST as archive } from "./route";
import { POST as restore } from "../restore/route";
import { GET as list } from "../../route";
import { POST as submit } from "../observations/route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const auth = (key: string) => ({ authorization: `Bearer ${key}` });
const call = (route: typeof archive, what: string, slug: string, key: string) =>
  route(new Request(`http://ziffr.test/api/v1/metrics/${slug}/${what}`, { method: "POST", headers: auth(key) }), { params: Promise.resolve({ slug }) });
const slugs = async (key: string, query = "") => ((await (await list(new Request(`http://ziffr.test/api/v1/metrics${query}`, { headers: auth(key) }), undefined as never)).json()).items as { slug: string }[]).map((m) => m.slug);

describe("archiving through the API", () => {
  it("needs metrics:write and the right person, lists Archived Metrics only when asked, and refuses their values", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const ben = await w.person("member"); const sara = await w.person("owner");
    const mine = await w.metric(ben, { name: "Old leads", sources: ["api"] });
    await w.token(mine.id, ben);
    const saras = await w.metric(sara, { name: "Visits" });
    await share(w.actor(sara), "metric", saras.id, ben, "viewer");
    const hidden = await w.metric(sara, { name: "Payroll" });
    const reader = (await createAccessKey(w.actor(ben, "member"), { name: "Reader", scopes: ["metrics:read", "values:submit"], expiresOn: inDays(30) })).secret;
    const { secret: key } = await createAccessKey(w.actor(ben, "member"), { name: "Tidy", scopes: ["metrics:read", "metrics:write"], expiresOn: inDays(30) });

    expect((await call(archive, "archive", mine.slug, reader)).status).toBe(403);
    expect((await call(archive, "archive", hidden.slug, key)).status).toBe(404);
    const notHis = await call(archive, "archive", saras.slug, key);
    expect(notHis.status).toBe(403);
    expect((await notHis.json()).error.message).toMatch(/Owners, Admins and the Metric's owner/);

    const ok = await call(archive, "archive", mine.slug, key);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ slug: mine.slug, archived: true });
    expect(await slugs(key)).toEqual([saras.slug]);
    expect(await slugs(key, "?archived=true")).toEqual([mine.slug]);
    expect((await list(new Request("http://ziffr.test/api/v1/metrics?archived=yes", { headers: auth(key) }), undefined as never)).status).toBe(400);

    const refused = await submit(new Request(`http://ziffr.test/api/v1/metrics/${mine.slug}/observations`, { method: "POST", headers: { ...auth(reader), "content-type": "application/json" }, body: JSON.stringify({ value: 3 }) }), { params: Promise.resolve({ slug: mine.slug }) });
    expect(refused.status).toBe(422);
    expect((await refused.json()).error.message).toBe("This Metric is archived.");

    const back = await call(restore, "restore", mine.slug, key);
    expect(back.status).toBe(200);
    expect(await back.json()).toMatchObject({ slug: mine.slug, archived: false });
    expect(await slugs(key)).toEqual([mine.slug, saras.slug]);
  });
});
