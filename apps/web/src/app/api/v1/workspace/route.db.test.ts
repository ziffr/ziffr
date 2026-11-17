// GET /api/v1/workspace over HTTP (spec 0017; GLOSSARY: Fiscal Year): any person's key that may read metrics reads
// the year start; a Feed Key reads it in GET /feed instead.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { setYearStart } from "@ziffr/core/fiscal-year";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const get = (secret: string) => GET(new Request("http://ziffr.test/api/v1/workspace", { headers: { authorization: `Bearer ${secret}` } }), {} as never);

describe("GET /api/v1/workspace", () => {
  it("answers the month the year starts in, for a key that may read metrics", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner"); const ben = await w.person("member");
    const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Read", scopes: ["metrics:read"], expiresOn: inDays(30) });
    expect(await (await get(secret)).json()).toEqual({ year_start_month: 1 });
    await setYearStart(w.actor(sara), 4);
    const res = await get(secret);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ year_start_month: 4 });
    const { secret: submitOnly } = await createAccessKey(w.actor(ben, "member"), { name: "Submit", scopes: ["values:submit"], expiresOn: inDays(30) });
    expect((await get(submitOnly)).status).toBe(403);
  });
});
