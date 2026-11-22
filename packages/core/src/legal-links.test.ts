// Legal links: shown on hosted Ziffr only, absent on every other Installation.
import { describe, expect, it } from "vitest";
import { legalLinks } from "./legal-links";

describe("legalLinks", () => {
  it("gives Ziffr's three pages with a Ziffr Cloud key", () => {
    expect(legalLinks({ ZIFFR_CLOUD_KEY: "k".repeat(32) })).toEqual({
      imprint: "https://ziffr.net/impressum",
      privacy: "https://ziffr.net/datenschutz/app",
      terms: "https://ziffr.net/terms",
    });
  });
  it("gives nothing without a key, with an empty or a short one", () => {
    expect(legalLinks({})).toBeNull();
    expect(legalLinks({ ZIFFR_CLOUD_KEY: "" })).toBeNull();
    expect(legalLinks({ ZIFFR_CLOUD_KEY: "short" })).toBeNull();
  });
});
