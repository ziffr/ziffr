// POST /api/jobs/retention over HTTP: only with the job secret, answering counts only. What the job does is tested in
// the core (retention-job.db.test.ts); here it stands in, as this test is about the door.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const counts = { started: 0, reminded: 0, metrics: 0, claimedElsewhere: 0, stopped: 0, needConfirmation: 0, condensed: 0, periods: 0, values: 0, mismatches: 0, heldBack: 0, failed: 0 };
vi.mock("@ziffr/core/retention-job", () => ({ retentionJob: vi.fn(async () => counts) }));
import { retentionJob } from "@ziffr/core/retention-job";
import { POST } from "./route";

const SECRET = "s".repeat(40);
const call = (auth?: string) => POST(new Request("http://ziffr.test/api/jobs/retention", { method: "POST", headers: auth ? { authorization: auth } : {} }));
let saved: string | undefined;
beforeEach(() => { saved = process.env.ZIFFR_JOB_SECRET; process.env.ZIFFR_JOB_SECRET = SECRET; vi.mocked(retentionJob).mockClear(); });
afterEach(() => { if (saved === undefined) delete process.env.ZIFFR_JOB_SECRET; else process.env.ZIFFR_JOB_SECRET = saved; });

describe("POST /api/jobs/retention", () => {
  it("answers 404 without the secret or with a wrong one, and does nothing", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, SECRET]) expect((await call(auth)).status).toBe(404);
    expect(retentionJob).not.toHaveBeenCalled();
  });
  it("runs the job with the secret and answers its counts only", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(counts);
    expect(retentionJob).toHaveBeenCalledOnce();
  });
});
