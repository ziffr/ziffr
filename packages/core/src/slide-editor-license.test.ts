import { describe, expect, it } from "vitest";
import { INSTALLATION_SETTINGS, SETTINGS_SECTIONS } from "./installation-catalogue";
import { SLIDE_EDITOR_KEY_MAX, slideEditorLicenseKey } from "./slide-editor-license";

// A made-up key: the shape only, signed by nobody.
const MADE_UP = "tldraw-2099-01-01/WyJtYWRlLXVwIl0=.c2lnbmF0dXJl+/==";

describe("the slide editor's license key", () => {
  it("takes a value with a key's shape, without line breaks and invisible characters", () => {
    expect(slideEditorLicenseKey(MADE_UP)).toBe(MADE_UP);
    expect(slideEditorLicenseKey(`  ${MADE_UP.slice(0, 20)}\r\n​${MADE_UP.slice(20)}\n`)).toBe(MADE_UP);
  });

  it("refuses anything else", () => {
    for (const bad of [undefined, null, 7, "", "key", "tldraw-x", "tldraw-x/abc", "other-x/abc.def", "tldraw-x/abc.def.ghi", "tldraw-x/a b.def", 'tldraw-x/abc."><script>', `tldraw-x/${"a".repeat(SLIDE_EDITOR_KEY_MAX)}.b`]) {
      expect(slideEditorLicenseKey(bad), String(bad).slice(0, 40)).toBeNull();
    }
  });

  it("is an Installation Setting the browser may see, in a section the page can set up", () => {
    expect(INSTALLATION_SETTINGS.find((s) => s.name === "ZIFFR_TLDRAW_LICENSE_KEY")).toMatchObject({ section: "slides", secret: false, maxLength: SLIDE_EDITOR_KEY_MAX });
    expect(SETTINGS_SECTIONS.find((s) => s.id === "slides")).toMatchObject({ ready: true });
  });
});
