// The email layout (ticket #542): escaping, links, dark-mode colours, the logo and the plain-text rule.
import { describe, expect, it } from "vitest";
import { emailHtml, emailLogo, emailLogoType, LOGO_CID } from "./branded-email";
import { themeLook } from "./theme-look";
import { STANDARD_THEMES } from "./standard-themes";
import { STARTER_THEME } from "./themes";

const look = themeLook(STARTER_THEME, "Acme <Co>");
const PNG = "data:image/png;base64," + Buffer.from("png-bytes").toString("base64");

describe("emailHtml", () => {
  it("escapes everything people wrote, links only http(s) addresses, and quotes with > lines", () => {
    const html = emailHtml(look, { text: 'Hi <script>alert(1)</script> "x"\n\nSee https://a.example/p?x=1&y=2. Not javascript:alert(1)\n\n> quoted <b>', stop: { label: "Stop <now>", url: "https://a.example/u?a=1&b=2" } });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<a href="https://a.example/p?x=1&amp;y=2"');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("<blockquote");
    expect(html).toContain("Stop &lt;now&gt;");
    expect(html).toContain("Acme &lt;Co&gt;");
  });
  it("shows the name without a logo and the attached logo with one", () => {
    expect(emailHtml(look, { text: "Hi" })).not.toContain("cid:");
    expect(emailHtml(look, { text: "Hi" }, { logo: true })).toContain(`cid:${LOGO_CID}`);
  });
  it("has dark-mode colours for a light Theme, none for a dark one, and a forced scheme for previews", () => {
    expect(emailHtml(look, { text: "Hi" })).toContain("prefers-color-scheme: dark");
    const night = themeLook(STANDARD_THEMES.find((t) => t.key === "ziffr-dark"), "N");
    expect(emailHtml(night, { text: "Hi" })).not.toContain("prefers-color-scheme");
    const forced = emailHtml(look, { text: "Hi" }, { scheme: "dark" });
    expect(forced).not.toContain("prefers-color-scheme");
    expect(forced).toContain("#101216");
  });
  it("shows the preheader and the footer lines", () => {
    const html = emailHtml({ ...look, footer: "Line one" }, { text: "Hi", preheader: "Short" });
    expect(html).toContain("Short");
    expect(html).toContain("Line one<br>Sent by Ziffr for Acme &lt;Co&gt;");
    // Ziffr's own line is fixed: the Theme's footer cannot replace it, and a caller may name the person behind it.
    expect(emailHtml(look, { text: "Hi", sentBy: "Sent by Ziffr for Ann (ann@x.test), who invited you to Acme." })).toContain("Sent by Ziffr for Ann (ann@x.test)");
  });
});

describe("emailLogo", () => {
  it("attaches only a small PNG or JPEG", () => {
    expect(emailLogoType({ logo: PNG })).toBe("image/png");
    expect(emailLogo({ logo: PNG })).toMatchObject({ contentType: "image/png" });
    expect(emailLogo({ logo: PNG })!.content.toString()).toBe("png-bytes");
    expect(emailLogoType({ logo: "data:image/svg+xml;base64,AAAA" })).toBeNull();
    expect(emailLogoType({ logo: "data:image/webp;base64,AAAA" })).toBeNull();
    expect(emailLogo({ logo: null })).toBeNull();
    expect(emailLogo({ logo: PNG }, 3)).toBeNull();
  });
});
