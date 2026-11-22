// What a Slack message carries as its sender (ticket #650): the Workspace's name and logo address, only with the scope.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canCustomize, slackIdentity } from "./slack-identity";
import { themeLook } from "./theme-look";
import { STARTER_THEME } from "./themes";

// A 1 x 1 PNG: the checks need a picture, not a pretty one.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const WS = "11111111-2222-3333-4444-555555555555";
const withLogo = themeLook({ tokens: STARTER_THEME.tokens, slides: { ...STARTER_THEME.slides, logo: PNG } }, "Acme Co");
const noLogo = themeLook({ tokens: STARTER_THEME.tokens, slides: { ...STARTER_THEME.slides, logo: "" } }, "Acme Co");

// The logo address is keyed with the Installation's secret; with none, no address is made.
beforeEach(() => { vi.stubEnv("ZIFFR_SECRETS_KEY", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key"); });
afterEach(() => vi.unstubAllEnvs());

describe("slackIdentity", () => {
  it("knows the scope from Slack's comma-separated list", () => {
    expect(canCustomize("chat:write,chat:write.customize,im:write")).toBe(true);
    expect(canCustomize("chat:write,im:write")).toBe(false);
    expect(canCustomize(null)).toBe(false);
    expect(canCustomize("chat:write.customized")).toBe(false);
  });

  it("sends the Workspace's name and its logo's public address, absolute", () => {
    const who = slackIdentity("chat:write,chat:write.customize", WS, withLogo, "https://ziffr.example.test/");
    expect(who.username).toBe("Acme Co");
    expect(who.icon_url).toMatch(new RegExp(`^https://ziffr\\.example\\.test/api/brand/logo/${WS}/[0-9a-f]{16}$`));
  });

  it("sends only the name when the Installation has no secret to key the address with", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(slackIdentity("chat:write,chat:write.customize", WS, withLogo, "https://ziffr.example.test")).toEqual({ username: "Acme Co" });
  });

  it("sends only the name when there is no logo, or no usable site address", () => {
    expect(slackIdentity("chat:write.customize", WS, noLogo, "https://ziffr.example.test")).toEqual({ username: "Acme Co" });
    expect(slackIdentity("chat:write.customize", WS, withLogo, "not a url")).toEqual({ username: "Acme Co" });
    expect(slackIdentity("chat:write.customize", WS, withLogo, "https://ziffr.example.test/path")).toEqual({ username: "Acme Co" });
    expect(slackIdentity("chat:write.customize", WS, withLogo, "http://ziffr.example.test")).toEqual({ username: "Acme Co" });
    expect(slackIdentity("chat:write.customize", WS, withLogo, "https://user:pw@ziffr.example.test")).toEqual({ username: "Acme Co" });
  });

  it("sends only the name for an SVG logo, which Slack cannot draw as an icon", () => {
    const svg = themeLook({ tokens: STARTER_THEME.tokens, slides: { ...STARTER_THEME.slides, logo: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>')}` } }, "Acme Co");
    expect(svg.logo).not.toBeNull();
    expect(slackIdentity("chat:write.customize", WS, svg, "https://ziffr.example.test")).toEqual({ username: "Acme Co" });
  });

  it("sends nothing without the scope, so Slack never refuses the message", () => {
    expect(slackIdentity("chat:write,im:write", WS, withLogo, "https://ziffr.example.test")).toEqual({});
  });
});
