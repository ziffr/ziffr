// The Admin Address (spec 0066; GLOSSARY: Admin Address): which request reaches the panel, and what the Admin Address
// serves. Unset, everything is as before; set wrong, the panel answers nowhere.
import { describe, expect, it } from "vitest";
import { adminAddress, adminPagesHere, adminRoute, installationHref, requestSide } from "./admin-address";

const on = adminAddress({ ZIFFR_ADMIN_URL: "https://admin.example.com", ZIFFR_SITE_URL: "https://app.example.com" });
const off = adminAddress({});
const headers = (host: string, forwarded?: string) => new Headers({ host, ...(forwarded === undefined ? {} : { "x-forwarded-host": forwarded }) });

describe("the setting", () => {
  it("is off when unset or empty", () => {
    expect(off).toEqual({ state: "off" });
    expect(adminAddress({ ZIFFR_ADMIN_URL: "  " })).toEqual({ state: "off" });
  });

  it("takes an address with only a host and a port", () => {
    expect(on).toEqual({ state: "on", origin: "https://admin.example.com", host: "admin.example.com", port: null });
    expect(adminAddress({ ZIFFR_ADMIN_URL: "http://Admin.Localhost:3200/", ZIFFR_SITE_URL: "http://localhost:3200" })).toMatchObject({ state: "on", host: "admin.localhost", port: "3200" });
  });

  it.each(["admin.example.com", "ftp://admin.example.com", "https://admin.example.com/panel", "https://a@admin.example.com", "https://admin.example.com?x=1", "https://app.example.com", "https://APP.example.com:8443"])(
    "closes the panel when it is wrong: %s", (value) => {
      const address = adminAddress({ ZIFFR_ADMIN_URL: value, ZIFFR_SITE_URL: "https://app.example.com" });
      expect(address.state).toBe("closed");
      expect(adminPagesHere(headers("admin.example.com"), address)).toBe(false);
      expect(adminRoute("/installation", headers("admin.example.com"), address)).toBe("not_found");
      expect(adminRoute("/installation", headers("app.example.com"), address)).toBe("not_found");
      expect(adminRoute("/metrics", headers("app.example.com"), address)).toBe("pass");
    });
});

describe("which side a request reached", () => {
  it.each([
    ["admin.example.com", undefined, "admin"],
    ["ADMIN.example.com:443", undefined, "admin"],
    ["admin.example.com", "admin.example.com", "admin"],
    ["app.example.com", undefined, "app"],
    ["app.example.com", "app.example.com", "app"],
    ["admin.example.com.evil.test", undefined, "app"],
    ["admin.example.com.", undefined, "app"],
    ["", undefined, "app"],
    ["app.example.com", "admin.example.com", "mixed"],
    ["app.example.com", "admin.example.com, app.example.com", "mixed"],
    ["admin.example.com", "app.example.com", "mixed"],
    ["localhost:3000", "admin.example.com", "mixed"],
  ])("host %s, forwarded %s: %s", (host, forwarded, side) => {
    expect(requestSide(headers(host, forwarded), on)).toBe(side);
    expect(adminPagesHere(headers(host, forwarded), on)).toBe(side === "admin");
  });

  it("with a port in the setting, only that port", () => {
    const local = adminAddress({ ZIFFR_ADMIN_URL: "http://admin.localhost:3200" });
    expect(requestSide(headers("admin.localhost:3200"), local)).toBe("admin");
    expect(requestSide(headers("admin.localhost:3201"), local)).toBe("app");
    expect(requestSide(headers("admin.localhost"), local)).toBe("app");
  });

  it("without an Admin Address the panel answers wherever Ziffr does", () => {
    expect(adminPagesHere(headers("anything.test"), off)).toBe(true);
    expect(adminRoute("/installation/users", headers("anything.test"), off)).toBe("pass");
    expect(adminRoute("/", headers("anything.test"), off)).toBe("pass");
  });
});

describe("what each side serves", () => {
  const admin = headers("admin.example.com");
  const app = headers("app.example.com");

  it.each(["/installation", "/installation/users", "/installation/feedback", "/login", "/auth/callback"])("the Admin Address serves %s", (path) => {
    expect(adminRoute(path, admin, on)).toBe("pass");
  });

  it.each(["/metrics", "/demo", "/api/v1/metrics", "/api/health", "/mcp", "/v/abc", "/submit/tk-1", "/guide", "/welcome", "/invite/x", "/oauth/authorize", "/loginx", "/auth/callback/x", "/installationx"])("the Admin Address does not serve %s", (path) => {
    expect(adminRoute(path, admin, on)).toBe("not_found");
  });

  it("sends its front page to the panel", () => {
    expect(adminRoute("/", admin, on)).toBe("panel");
  });

  it.each(["/installation", "/installation/users", "/installation/health"])("the app does not serve %s", (path) => {
    expect(adminRoute(path, app, on)).toBe("not_found");
  });

  it.each(["/", "/metrics", "/login", "/api/v1/installation/usage", "/api/slide-license"])("the app serves %s", (path) => {
    expect(adminRoute(path, app, on)).toBe("pass");
  });

  it("answers nothing to headers that disagree", () => {
    expect(adminRoute("/metrics", headers("app.example.com", "admin.example.com"), on)).toBe("not_found");
  });

  it("links to the panel where it answers", () => {
    expect(installationHref("/installation#practice", on)).toBe("https://admin.example.com/installation#practice");
    expect(installationHref("/installation", off)).toBe("/installation");
  });
});
