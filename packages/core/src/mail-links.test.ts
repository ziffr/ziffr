// How an address in an email is shown (mail-links.ts): only this Ziffr's addresses become buttons, and the plain-text
// part keeps them whole on their own line without touching what a person wrote.
import { describe, expect, it } from "vitest";
import { aroundAction, buttonWords, linkLine, linkWords, mainAction, plainWords } from "./mail-links";

const OWN = ["https://z.example.test/"];

describe("this Ziffr's addresses", () => {
  it("are compared up to a slash, so look-alikes are somewhere else", () => {
    for (const url of ["https://z.example.test.evil.test/actions/1", "https://z.example.test@evil.test/", "https://evil.test/?u=https://z.example.test/", "http://z.example.test/actions/1"]) {
      expect(linkLine(`Open: ${url}`, OWN)).toBeNull();
      expect(linkWords(url, OWN)).toBe(`Link to ${new URL(url).host}`);
    }
    expect(linkWords("https://z.example.test/dashboards/1", OWN)).toBe("Link to Ziffr");
    expect(buttonWords("https://z.example.test", OWN)).toBe("Open Ziffr");
    expect(linkLine("Open: https://z.example.test/x", [])).toBeNull();
    expect(linkLine("Open: https://z.example.test/x", [""])).toBeNull();
  });
});

describe("the plain-text part", () => {
  it("puts an address on its own line in angle brackets, keeping words, indent and the token", () => {
    const text = "Hi\r\n\r\nOpen: https://z.example.test/submit/tk-a_b-\n  https://z.example.test/x?a=1&b=2.";
    const once = plainWords(text, OWN);
    expect(once).toBe("Hi\n\nOpen:\n<https://z.example.test/submit/tk-a_b->\n  <https://z.example.test/x?a=1&b=2>");
    expect(plainWords(once, OWN)).toBe(once);
    expect(linkLine("<https://z.example.test/x?next=(a)>.", OWN)?.url).toBe("https://z.example.test/x?next=(a)");
  });
  it("leaves quoted words, addresses elsewhere and addresses inside a sentence as written", () => {
    for (const line of ["> see https://z.example.test/x", "see https://other.example.test/x", "https://z.example.test/x is the one"]) expect(plainWords(line, OWN)).toBe(line);
  });
});

describe("the button", () => {
  it("is the last line that ends with an address here, never a stop link or a quoted one", () => {
    const text = "Open: https://z.example.test/actions/1\n> https://z.example.test/dashboards/2\nTo stop: https://z.example.test/api/unsubscribe/t";
    expect(mainAction(text, OWN)).toEqual({ label: "Open in Ziffr", url: "https://z.example.test/actions/1" });
    expect(mainAction("Nothing here https://other.example.test/", OWN)).toBeNull();
  });
  it("takes the place of its line, keeping words only where the button does not say them", () => {
    const url = "https://z.example.test/actions/1";
    expect(aroundAction(`Hi\n\nOpen: ${url}\n\nBye`, url)).toEqual({ before: "Hi", after: "\nBye" });
    expect(aroundAction(`Hi\n\nAnswer here: ${url}`, url)).toEqual({ before: "Hi\n\nAnswer here.", after: "" });
    expect(aroundAction(`Open this to sign in:\n\n<${url}>`, url)).toEqual({ before: "Open this to sign in.", after: "" });
    expect(aroundAction("No address", url)).toEqual({ before: "No address", after: "" });
  });
});
