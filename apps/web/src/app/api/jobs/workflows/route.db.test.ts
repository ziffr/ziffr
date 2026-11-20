// POST /api/jobs/workflows over HTTP (spec 0005, ticket #85): only with the job secret, and nothing told otherwise.
// What it runs is proven in the core's scheduled-runs.db.test.ts; here the run stands in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The run itself would touch every workspace in the database; this test is about the door, so it stands in.
vi.mock("@ziffr/core/scheduled-runs", () => ({ runDueWorkspaces: vi.fn(async () => ({ ran: 2, failed: 0 })) }));
import { POST } from "./route";

const SECRET = "s".repeat(40);
const call = (auth?: string) => POST(new Request("http://ziffr.test/api/jobs/workflows", { method: "POST", headers: auth ? { authorization: auth } : {} }));
let saved: string | undefined;
beforeEach(() => { saved = process.env.ZIFFR_JOB_SECRET; process.env.ZIFFR_JOB_SECRET = SECRET; });
afterEach(() => { if (saved === undefined) delete process.env.ZIFFR_JOB_SECRET; else process.env.ZIFFR_JOB_SECRET = saved; });

describe("POST /api/jobs/workflows", () => {
  it("answers 404 without the secret, with a wrong one, or when the job is off", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, SECRET]) expect((await call(auth)).status).toBe(404);
    process.env.ZIFFR_JOB_SECRET = "too-short";
    expect((await call("Bearer too-short")).status).toBe(404);
    delete process.env.ZIFFR_JOB_SECRET;
    expect((await call("Bearer ")).status).toBe(404);
  });
  it("runs what is due and says only how many", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: 2, failed: 0, limitNotices: expect.any(Number) });
  });
});
