// POST /api/inbound/feedback-github over HTTP (spec 0049, #918): signed by GitHub or a bare refusal, only on the central
// version, the body limit, and that a replayed delivery or a failure leaks nothing to the answer or the log. What an
// event does is tested in the core (feedback-webhook-rules.test.ts, feedback-back.db.test.ts); the core is mocked here.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ziffr/core/feedback-back", () => ({ receiveGithubFeedbackEvent: vi.fn(async () => "comment") }));
vi.mock("@ziffr/core/feedback-github", async (orig) => ({ ...(await orig<object>()), githubClient: vi.fn(() => ({ botLogin: async () => "ziffr-bot" })) }));
import { receiveGithubFeedbackEvent } from "@ziffr/core/feedback-back";
// The settings in effect are the environment here (no database): only the cloud key is read.
vi.mock("@ziffr/core/settings-in-effect", () => ({ settingsInEffect: async () => ({ ZIFFR_CLOUD_KEY: process.env.ZIFFR_CLOUD_KEY }) }));
const forgetStoredSettings = () => {};
import { POST } from "./route";

const SECRET = "w".repeat(40);
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const payload = JSON.stringify({ action: "created", comment: { body: "SECRET WORDS of an answer" } });
const call = (body = payload, headers: Record<string, string> = {}) =>
  POST(new Request("http://ziffr.test/api/inbound/feedback-github", { method: "POST", body, headers: { "x-hub-signature-256": sign(body), "x-github-event": "issue_comment", "x-github-delivery": "11111111-2222-3333-4444-555555555555", ...headers } }));
const names = ["ZIFFR_CLOUD_KEY", "ZIFFR_FEEDBACK_GITHUB_WEBHOOK_SECRET", "ZIFFR_FEEDBACK_GITHUB_TOKEN", "ZIFFR_FEEDBACK_GITHUB_REPO", "ZIFFR_FEEDBACK_GITHUB_CATEGORY_ID"];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  process.env.ZIFFR_CLOUD_KEY = "k".repeat(32); process.env.ZIFFR_FEEDBACK_GITHUB_WEBHOOK_SECRET = SECRET;
  process.env.ZIFFR_FEEDBACK_GITHUB_TOKEN = "t"; process.env.ZIFFR_FEEDBACK_GITHUB_REPO = "ziffr/ziffr"; process.env.ZIFFR_FEEDBACK_GITHUB_CATEGORY_ID = "DIC_x";
  forgetStoredSettings(); vi.mocked(receiveGithubFeedbackEvent).mockClear();
});
afterEach(() => { for (const n of names) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; } forgetStoredSettings(); vi.restoreAllMocks(); });

describe("POST /api/inbound/feedback-github", () => {
  it("answers a bare 404 off the central version, without a secret and with a short one, and does nothing", async () => {
    delete process.env.ZIFFR_CLOUD_KEY; forgetStoredSettings();
    expect((await call()).status).toBe(404);
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32); forgetStoredSettings();
    delete process.env.ZIFFR_FEEDBACK_GITHUB_WEBHOOK_SECRET;
    expect((await call()).status).toBe(404);
    process.env.ZIFFR_FEEDBACK_GITHUB_WEBHOOK_SECRET = "short";
    const res = await POST(new Request("http://ziffr.test/x", { method: "POST", body: payload, headers: { "x-hub-signature-256": sign(payload, "short") } }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(receiveGithubFeedbackEvent).not.toHaveBeenCalled();
  });

  it("answers 401 to a missing, wrong or sha1 signature, and to a body changed after signing", async () => {
    expect((await call(payload, { "x-hub-signature-256": "" })).status).toBe(401);
    expect((await call(payload, { "x-hub-signature-256": sign(payload, "x".repeat(40)) })).status).toBe(401);
    expect((await call(payload, { "x-hub-signature-256": `sha1=${"0".repeat(40)}` })).status).toBe(401);
    const tampered = await POST(new Request("http://ziffr.test/x", { method: "POST", body: payload.replace("answer", "ANSWER"), headers: { "x-hub-signature-256": sign(payload) } }));
    expect(tampered.status).toBe(401);
    expect(receiveGithubFeedbackEvent).not.toHaveBeenCalled();
  });

  it("answers 413 to a body over the limit, declared or not, before it checks anything", async () => {
    const big = "x".repeat(600 * 1024);
    expect((await call(big)).status).toBe(413);
    const declared = await POST(new Request("http://ziffr.test/x", { method: "POST", body: "{}", headers: { "content-length": "99999999" } }));
    expect(declared.status).toBe(413);
    expect(receiveGithubFeedbackEvent).not.toHaveBeenCalled();
  });

  it("answers 400 to a signed body that is not JSON", async () => {
    expect((await call("not json")).status).toBe(400);
  });

  it("hands a signed event to the core with the delivery id, the event name and the settings' repository and bot, and answers the outcome only", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "comment" });
    expect(receiveGithubFeedbackEvent).toHaveBeenCalledWith(
      { deliveryId: "11111111-2222-3333-4444-555555555555", event: "issue_comment", payload: JSON.parse(payload) },
      { repo: "ziffr/ziffr", bot: "ziffr-bot" },
    );
  });

  it("answers a repeat like any other: what the core says", async () => {
    vi.mocked(receiveGithubFeedbackEvent).mockResolvedValueOnce("replay");
    expect(await (await call()).json()).toEqual({ outcome: "replay" });
  });

  it("answers 500 without detail and logs a fixed phrase, never the words, when handling fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(receiveGithubFeedbackEvent).mockRejectedValueOnce(new Error("SECRET WORDS of an answer"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("SECRET WORDS");
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET WORDS");
  });
});
