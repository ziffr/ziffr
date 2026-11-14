// POST /api/jobs/deliveries over HTTP (spec 0004, ticket #71): only with the job secret, and nothing told otherwise.
// What it sends is proven in the core's mail.db.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const SECRET = "s".repeat(40);
const call = (auth?: string) => POST(new Request("http://ziffr.test/api/jobs/deliveries", { method: "POST", headers: auth ? { authorization: auth } : {} }));
let saved: string | undefined;
beforeEach(() => { saved = process.env.ZIFFR_JOB_SECRET; process.env.ZIFFR_JOB_SECRET = SECRET; });
afterEach(() => { if (saved === undefined) delete process.env.ZIFFR_JOB_SECRET; else process.env.ZIFFR_JOB_SECRET = saved; });

describe("POST /api/jobs/deliveries", () => {
  it("answers 404 without the secret, with a wrong one, or when the job is off", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, SECRET]) expect((await call(auth)).status).toBe(404);
    process.env.ZIFFR_JOB_SECRET = "too-short";
    expect((await call("Bearer too-short")).status).toBe(404);
    delete process.env.ZIFFR_JOB_SECRET;
    expect((await call("Bearer ")).status).toBe(404);
  });
  it("sends what is waiting and says only how many", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: expect.any(Number), failed: expect.any(Number) });
  });
});
