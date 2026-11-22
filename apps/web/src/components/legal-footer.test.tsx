// The legal footer: Imprint, Privacy notice and Terms on hosted Ziffr, nothing on any other Installation.
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegalFooter, SignUpAgreement } from "./legal-footer";

afterEach(() => vi.unstubAllEnvs());

describe("LegalFooter", () => {
  it("shows the three links, each in a new tab, with a Ziffr Cloud key", () => {
    vi.stubEnv("ZIFFR_CLOUD_KEY", "k".repeat(32));
    const html = renderToString(<LegalFooter />);
    expect(html).toContain('href="https://ziffr.net/impressum"');
    expect(html).toContain('href="https://ziffr.net/datenschutz/app"');
    expect(html).toContain('href="https://ziffr.net/terms"');
    expect(html.match(/target="_blank"/g)).toHaveLength(3);
  });
  it("shows nothing without a key", () => {
    vi.stubEnv("ZIFFR_CLOUD_KEY", "");
    expect(renderToString(<LegalFooter />)).toBe("");
  });
});

describe("SignUpAgreement", () => {
  it("agrees to the Terms and the Privacy notice on hosted Ziffr only", () => {
    vi.stubEnv("ZIFFR_CLOUD_KEY", "k".repeat(32));
    expect(renderToString(<SignUpAgreement />).replace(/<[^>]+>/g, "")).toContain("By signing up you agree to the Terms and the Privacy notice.");
    vi.stubEnv("ZIFFR_CLOUD_KEY", "");
    expect(renderToString(<SignUpAgreement />)).toBe("");
  });
});
