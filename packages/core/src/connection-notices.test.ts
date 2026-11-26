// The disconnect link of a connection notice asks for the secrets key: pure, since a link that is not accepted never
// reaches the database.
import { afterEach, describe, expect, it } from "vitest";
import { chatDisconnectView, disconnectByLink } from "./connection-notices";
import { unsubscribeSigner } from "./unsubscribe-token";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe("a disconnect link", () => {
  it("is not accepted where there is no secrets key, also signed with the job secret", async () => {
    delete process.env.ZIFFR_SECRETS_KEY;
    process.env.ZIFFR_JOB_SECRET = "j".repeat(40);
    const token = unsubscribeSigner("ziffr/account-disconnect/v1", /^[^\n]+$/, 400).sign(`telegram|00000000-0000-4000-8000-000000000000|someone|${Date.now()}`)!;
    expect(token).toBeTruthy();
    expect(await chatDisconnectView(token)).toBeNull();
    expect(await disconnectByLink(token)).toBeNull();
  });
});
