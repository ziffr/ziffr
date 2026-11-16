// POST /api/jobs/demo-reset over HTTP: only with the job secret, only where the demo is offered, and nothing told
// otherwise. The reset itself is the one the demo's reset button runs; here it stands in, as this test is about the door.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ziffr/core/demo-reset", () => ({ resetDemoWorkspace: vi.fn(async () => true) }));
import { POST } from "./route";

const SECRET = "s".repeat(40);
const call = (auth?: string) => POST(new Request("http://ziffr.test/api/jobs/demo-reset", { method: "POST", headers: auth ? { authorization: auth } : {} }));
const KEYS = ["ZIFFR_JOB_SECRET", "ZIFFR_DEMO", "ZIFFR_DEMO_ONLY"] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.ZIFFR_JOB_SECRET = SECRET;
  delete process.env.ZIFFR_DEMO;
  delete process.env.ZIFFR_DEMO_ONLY;
});
afterEach(() => { for (const k of KEYS) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });

describe("POST /api/jobs/demo-reset", () => {
  it("answers 404 without the secret or with a wrong one", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, SECRET]) expect((await call(auth)).status).toBe(404);
  });
  it("answers 404 where the demo is off", async () => {
    process.env.ZIFFR_DEMO = "0";
    expect((await call(`Bearer ${SECRET}`)).status).toBe(404);
  });
  it("resets the demo, also in a demo-only Ziffr that says ZIFFR_DEMO=0", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reset: true });
    process.env.ZIFFR_DEMO = "0";
    process.env.ZIFFR_DEMO_ONLY = "1";
    expect((await call(`Bearer ${SECRET}`)).status).toBe(200);
  });
});
