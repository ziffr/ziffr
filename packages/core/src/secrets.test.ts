// Sealing secrets and the Slack settings (spec 0007, ticket #101): pure checks, no database.
import { describe, expect, it } from "vitest";
import { openSecret, openSecretRotating, previousSecretsKey, sealSecret, secretsKey } from "./secrets";
import { slackApiBase, slackEnabled } from "./slack-api";

const key = Buffer.alloc(32, 9);

describe("sealed secrets", () => {
  it("opens only for the same owner and key, and never when changed", () => {
    const sealed = sealSecret("xoxb-secret", "slack-bot:a", key);
    expect(sealed).not.toContain("xoxb");
    expect(sealSecret("xoxb-secret", "slack-bot:a", key)).not.toBe(sealed);
    expect(openSecret(sealed, "slack-bot:a", key)).toBe("xoxb-secret");
    expect(openSecret(sealed, "slack-bot:b", key)).toBeNull();
    expect(openSecret(sealed, "slack-bot:a", Buffer.alloc(32, 8))).toBeNull();
    const [v, iv, ct, tag] = sealed.split(".");
    expect(openSecret([v, iv, ct, tag.slice(0, 8)].join("."), "slack-bot:a", key)).toBeNull();
    expect(openSecret([v, iv, `${ct[0] === "A" ? "B" : "A"}${ct.slice(1)}`, tag].join("."), "slack-bot:a", key)).toBeNull();
    expect(openSecret("garbage", "slack-bot:a", key)).toBeNull();
  });
  it("takes a key of exactly 32 bytes, as base64 or hex", () => {
    expect(secretsKey({ ZIFFR_SECRETS_KEY: key.toString("base64") })?.equals(key)).toBe(true);
    expect(secretsKey({ ZIFFR_SECRETS_KEY: key.toString("hex") })?.equals(key)).toBe(true);
    expect(secretsKey({ ZIFFR_SECRETS_KEY: "short" })).toBeNull();
    expect(secretsKey({ ZIFFR_SECRETS_KEY: Buffer.alloc(16).toString("base64") })).toBeNull();
    expect(secretsKey({})).toBeNull();
  });
});

describe("Slack settings", () => {
  const all = { ZIFFR_SLACK_CLIENT_ID: "1.2", ZIFFR_SLACK_CLIENT_SECRET: "x", ZIFFR_SLACK_SIGNING_SECRET: "s".repeat(32), ZIFFR_SECRETS_KEY: key.toString("base64"), ZIFFR_SITE_URL: "https://z.example" };
  it("is on only with every setting", () => {
    expect(slackEnabled(all)).toBe(true);
    for (const k of Object.keys(all)) expect(slackEnabled({ ...all, [k]: "" })).toBe(false);
  });
  it("calls slack.com unless an https address (or this machine) is set", () => {
    expect(slackApiBase({})).toBe("https://slack.com/api");
    expect(slackApiBase({ ZIFFR_SLACK_API_URL: "https://slack-gov.com/api/" })).toBe("https://slack-gov.com/api");
    expect(slackApiBase({ ZIFFR_SLACK_API_URL: "http://evil.example/api" })).toBe("https://slack.com/api");
    expect(slackApiBase({ ZIFFR_SLACK_API_URL: "http://127.0.0.1:4000/api" })).toBe("http://127.0.0.1:4000/api");
  });
});

describe("changing the key (spec 0009)", () => {
  const oldKey = Buffer.alloc(32, 1); const newKey = Buffer.alloc(32, 2);
  it("opens with the current key, else the previous one, and says when it was the previous", () => {
    const sealedOld = sealSecret("xoxb-old", "ws-1", oldKey);
    const sealedNew = sealSecret("xoxb-new", "ws-1", newKey);
    expect(openSecretRotating(sealedNew, "ws-1", { current: newKey, previous: oldKey })).toEqual({ plain: "xoxb-new", stale: false });
    expect(openSecretRotating(sealedOld, "ws-1", { current: newKey, previous: oldKey })).toEqual({ plain: "xoxb-old", stale: true });
    // Without the previous key, or for another owner, nothing opens.
    expect(openSecretRotating(sealedOld, "ws-1", { current: newKey, previous: null })).toBeNull();
    expect(openSecretRotating(sealedOld, "ws-2", { current: newKey, previous: oldKey })).toBeNull();
  });
  it("reads the previous key from its own setting", () => {
    expect(previousSecretsKey({ ZIFFR_SECRETS_KEY_PREVIOUS: oldKey.toString("base64") })?.equals(oldKey)).toBe(true);
    expect(previousSecretsKey({ ZIFFR_SECRETS_KEY: oldKey.toString("base64") })).toBeNull();
  });
});
