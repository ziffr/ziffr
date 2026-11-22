// POST /api/jobs/heads-ups over HTTP: only with the job secret, answering counts only. What the job does is tested in the core
// (heads-ups.db.test.ts); here it stands in, as this test is about the door.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const counts = { workspaces: 3, scanned: 2, skipped: 1, failed: 0, pairs: 12, expired: 0, left: 0 };
vi.mock("@ziffr/core/heads-ups", () => ({ headsUpJob: vi.fn(async () => counts) }));
import { headsUpJob } from "@ziffr/core/heads-ups";
import { POST } from "./route";

const SECRET = "s".repeat(40);
const call = (auth?: string) => POST(new Request("http://ziffr.test/api/jobs/heads-ups", { method: "POST", headers: auth ? { authorization: auth } : {} }));
let saved: string | undefined;
beforeEach(() => { saved = process.env.ZIFFR_JOB_SECRET; process.env.ZIFFR_JOB_SECRET = SECRET; vi.mocked(headsUpJob).mockClear(); });
afterEach(() => { if (saved === undefined) delete process.env.ZIFFR_JOB_SECRET; else process.env.ZIFFR_JOB_SECRET = saved; });

describe("POST /api/jobs/heads-ups", () => {
  it("answers 404 without the secret or with a wrong one, and does nothing", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, SECRET]) expect((await call(auth)).status).toBe(404);
    expect(headsUpJob).not.toHaveBeenCalled();
  });
  it("runs the job with the secret and answers its counts only", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(counts);
    expect(headsUpJob).toHaveBeenCalledOnce();
  });
});
