// The Ziffr Cloud API over HTTP (spec 0029, ticket #267): 404 without ZIFFR_CLOUD_KEY, 401 for an unsigned call, and a
// signed read and write through the route handlers, with no cookie and no cache.
import { afterEach, describe, expect, it } from "vitest";
import { signCloudCall } from "@ziffr/core/cloud-api";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET } from "./route";
import { PUT } from "./limit/route";

const KEY = "c".repeat(40);
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { delete process.env.ZIFFR_CLOUD_KEY; for (const c of cleanups.splice(0)) await c(); });
const signed = (method: string, path: string, body = "") =>
  new Request(`http://ziffr.test${path}`, { method, headers: { "ziffr-cloud-signature": signCloudCall({ method, path, body }, { ZIFFR_CLOUD_KEY: KEY }), "content-type": "application/json" }, body: method === "GET" ? undefined : body });

describe("/api/cloud/v1/workspaces/{id}", () => {
  it("is not there without the key, refuses unsigned calls, and reads and sets with a signed one", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); await w.metric(sara);
    const path = `/api/cloud/v1/workspaces/${w.id}`;
    const params = { params: Promise.resolve({ id: w.id }) };
    expect((await GET(signed("GET", path), params)).status).toBe(404);
    process.env.ZIFFR_CLOUD_KEY = KEY;
    expect((await GET(new Request(`http://ziffr.test${path}`), params)).status).toBe(401);
    const read = await GET(signed("GET", path), params);
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(await read.json()).toMatchObject({ id: w.id, exists: true, metrics: 1, limit: null });
    const body = JSON.stringify({ metrics: 50, label: "Small" });
    const put = await PUT(signed("PUT", `${path}/limit`, body), params);
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ limit: 50, label: "Small", set_by: "cloud" });
    // Unknown fields, markup in a label and a too-large limit are refused before anything is written.
    for (const bad of [{ metrics: 5, endTrial: true }, { metrics: 5, label: "<b>x</b>" }, { metrics: 2_000_000 }]) {
      expect((await PUT(signed("PUT", `${path}/limit`, JSON.stringify(bad)), params)).status).toBe(400);
    }
  });
});
