import { describe, expect, it } from "vitest";
import { needsLicenseKey } from "./slide-license-rules";

const at = (url: string, built = true) => needsLicenseKey(new URL(url), built);

describe("when the slide editor needs its license key", () => {
  it("does on a built app's public https address", () => {
    expect(at("https://ziffr.example.com/decks/1")).toBe(true);
    expect(at("https://192.0.2.7/")).toBe(true);
    expect(at("http://ziffr.localhost/")).toBe(true);
  });

  it("does not over http, on this machine or while developing", () => {
    expect(at("http://ziffr.example.com/")).toBe(false);
    expect(at("http://localhost:3000/")).toBe(false);
    expect(at("https://localhost/")).toBe(false);
    expect(at("https://127.0.0.1/")).toBe(false);
    expect(at("https://[::1]/")).toBe(false);
    expect(at("https://ziffr.example.com/", false)).toBe(false);
  });
});
