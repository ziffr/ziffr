// POST /api/jobs/feedback over HTTP (spec 0049, #917): only with the job secret and only on hosted Ziffr, counts only,
// and a 503 that names the missing settings. What filing does is tested in the core (feedback-filing.db.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const counts = { claimed: 1, filed: 1, found: 0, failed: 0 };
vi.mock("@ziffr/core/feedback-filing", () => ({ fileFeedback: vi.fn(async () => counts) }));
import { fileFeedback } from "@ziffr/core/feedback-filing";
import { forgetStoredSettings } from "@ziffr/core/settings-in-effect";
import { POST } from "./route";

const SECRET = "s".repeat(40);
const call = (auth?: string) => POST(new Request("http://ziffr.test/api/jobs/feedback", { method: "POST", headers: auth ? { authorization: auth } : {} }));
const names = ["ZIFFR_JOB_SECRET", "ZIFFR_CLOUD_KEY", "ZIFFR_FEEDBACK_GITHUB_TOKEN", "ZIFFR_FEEDBACK_GITHUB_REPO", "ZIFFR_FEEDBACK_GITHUB_CATEGORY_ID"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  process.env.ZIFFR_JOB_SECRET = SECRET; process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
  process.env.ZIFFR_FEEDBACK_GITHUB_TOKEN = "t"; process.env.ZIFFR_FEEDBACK_GITHUB_REPO = "ziffr/ziffr"; process.env.ZIFFR_FEEDBACK_GITHUB_CATEGORY_ID = "DIC_x";
  forgetStoredSettings(); vi.mocked(fileFeedback).mockClear();
});
afterEach(() => { for (const n of names) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; } forgetStoredSettings(); });

describe("POST /api/jobs/feedback", () => {
  it("answers 404 without the secret, and off hosted Ziffr, and does nothing", async () => {
    for (const auth of [undefined, "Bearer wrong"]) expect((await call(auth)).status).toBe(404);
    delete process.env.ZIFFR_CLOUD_KEY; forgetStoredSettings();
    expect((await call(`Bearer ${SECRET}`)).status).toBe(404);
    expect(fileFeedback).not.toHaveBeenCalled();
  });
  it("files with the secret and answers counts only", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(counts);
  });
  it("answers 503 naming the missing settings, never a value", async () => {
    delete process.env.ZIFFR_FEEDBACK_GITHUB_REPO;
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(503);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("ZIFFR_FEEDBACK_GITHUB_REPO");
    expect(text).not.toContain("DIC_x");
    expect(fileFeedback).not.toHaveBeenCalled();
  });
});
