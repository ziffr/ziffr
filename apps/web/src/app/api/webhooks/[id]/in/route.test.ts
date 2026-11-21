// The inbound route's cheap gate (ticket #487): a flood of unsigned requests is answered 429 before the core looks the
// Webhook up or opens its secret; requests under the limit still reach it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEBHOOK_INBOUND_FAILURES_PER_ADDRESS } from "@ziffr/core/webhook-limits";
import { resetWebhookInboundGate } from "@ziffr/core/webhook-inbound-gate";

const authenticate = vi.hoisted(() => vi.fn());
vi.mock("@ziffr/core/webhook-inbound", () => ({
  authenticateWebhookRequest: authenticate,
  applyWebhookAction: vi.fn(async () => ({ changed: true, status: "answered" })),
  WebhookRequestError: class extends Error {},
}));
import { POST } from "./route";

const ID = "6f1c2d3e-0000-4000-8000-000000000001";
const ID2 = "6f1c2d3e-0000-4000-8000-000000000002";
const call = (id: string, ip: string) =>
  POST(new Request(`http://ziffr.test/api/webhooks/${id}/in`, { method: "POST", body: "{}", headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ id }) });

beforeEach(() => { resetWebhookInboundGate(); authenticate.mockReset(); authenticate.mockResolvedValue({ ok: false, why: "not_found" }); process.env.ZIFFR_PROXY_HOPS = "1"; });
afterEach(() => { delete process.env.ZIFFR_PROXY_HOPS; });

describe("POST /api/webhooks/{id}/in gate", () => {
  it("answers 429 to an address that keeps failing, without reaching the core, and still serves other addresses", async () => {
    for (let i = 0; i < WEBHOOK_INBOUND_FAILURES_PER_ADDRESS; i++) expect((await call(ID, "9.9.9.9")).status).toBe(404);
    authenticate.mockClear();
    const res = await call(ID, "9.9.9.9");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_many_requests" });
    expect(authenticate).not.toHaveBeenCalled();
    expect((await call(ID, "8.8.8.8")).status).toBe(404);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it("never counts signed requests, and a signed sender stays served after its address failed once, even past the 60 a minute", async () => {
    authenticate.mockResolvedValue({ ok: true, actor: {} });
    for (let i = 0; i < 100; i++) expect((await call(ID, "7.7.7.7")).status).toBe(200);
    authenticate.mockResolvedValue({ ok: false, why: "limit" });
    expect((await call(ID, "7.7.7.7")).status).toBe(429);
    authenticate.mockResolvedValue({ ok: false, why: "not_found" });
    for (let i = 0; i < WEBHOOK_INBOUND_FAILURES_PER_ADDRESS * 2; i++) await call(ID, "7.7.7.7");
    authenticate.mockClear();
    await call(ID, "7.7.7.7");
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
});
