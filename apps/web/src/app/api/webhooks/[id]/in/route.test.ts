// The inbound route's cheap gate (ticket #487): a flood of unsigned requests is answered 429 before the core looks the
// Webhook up or opens its secret; requests under the limit still reach it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEBHOOK_INBOUND_GATE_PER_ADDRESS } from "@ziffr/core/webhook-limits";
import { resetWebhookInboundGate } from "@ziffr/core/webhook-inbound-gate";

const authenticate = vi.hoisted(() => vi.fn());
vi.mock("@ziffr/core/webhook-inbound", () => ({
  authenticateWebhookRequest: authenticate,
  applyWebhookAction: vi.fn(async () => ({ changed: true, status: "answered" })),
  WebhookRequestError: class extends Error {},
}));
import { POST } from "./route";

const ID = "6f1c2d3e-0000-4000-8000-000000000001";
const call = (id: string, ip: string) =>
  POST(new Request(`http://ziffr.test/api/webhooks/${id}/in`, { method: "POST", body: "{}", headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({ id }) });

beforeEach(() => { resetWebhookInboundGate(); authenticate.mockReset(); authenticate.mockResolvedValue({ ok: false, why: "not_found" }); process.env.ZIFFR_PROXY_HOPS = "1"; });
afterEach(() => { delete process.env.ZIFFR_PROXY_HOPS; });

describe("POST /api/webhooks/{id}/in gate", () => {
  it("answers 429 past the limit without ever reaching the core, for a known or made-up id alike; another address still passes", async () => {
    for (let i = 0; i < WEBHOOK_INBOUND_GATE_PER_ADDRESS; i++) expect((await call(ID, "9.9.9.9")).status).toBe(404);
    expect(authenticate).toHaveBeenCalledTimes(WEBHOOK_INBOUND_GATE_PER_ADDRESS);
    for (const id of [ID, "6f1c2d3e-0000-4000-8000-000000000002"]) {
      if (id !== ID) for (let i = 0; i <= WEBHOOK_INBOUND_GATE_PER_ADDRESS; i++) await call(id, "9.9.9.9");
    }
    authenticate.mockClear();
    const res = await call(ID, "9.9.9.9");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_many_requests" });
    expect(authenticate).not.toHaveBeenCalled();
    expect((await call(ID, "8.8.8.8")).status).toBe(404);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it("lets a signed sender under the limit through", async () => {
    authenticate.mockResolvedValue({ ok: true, actor: {} });
    const res = await call(ID, "7.7.7.7");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ changed: true, status: "answered" });
  });
});
