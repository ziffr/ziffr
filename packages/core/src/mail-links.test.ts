// How an address in an email is shown (mail-links.ts): only the address Ziffr added becomes a button, every other one
// shows where it leads, and the plain-text part keeps Ziffr's addresses whole on their own line without touching what a
// person wrote.
import { describe, expect, it } from "vitest";
import { appendedLink, aroundAction, buttonTo, linkLine, plainWords, shownTarget, unlinked } from "./mail-links";

const OWN = ["https://z.example.test/"];

describe("the address Ziffr appended", () => {
  it("is read from the last line only, in Ziffr's words there, and only when it leads here", () => {
    expect(appendedLink("Hi\nOpen: https://z.example.test/actions/1\n", OWN)).toBe("https://z.example.test/actions/1");
    for (const text of [
      // A person's line above, with nothing of Ziffr's at the end.
      "Open: https://z.example.test/submit/theirs\nJust reply to this email with the number.",
      // Words Ziffr does not write, an address alone, a quoted line.
      "See here: https://z.example.test/submit/theirs", "https://z.example.test/submit/theirs", "> Open: https://z.example.test/x", "  Open: https://z.example.test/x",
      // Somewhere else, also look-alikes.
      "Open: https://z.example.test.evil.test/x", "Open: https://z.example.test@evil.test/", "Open: http://z.example.test/x",
    ]) expect(appendedLink(text, OWN)).toBeNull();
    expect(appendedLink("Open: https://z.example.test/x", [""])).toBeNull();
  });
});

describe("the link to the combined form", () => {
  it("is the email's button, whether or not a reply is the other way to answer", () => {
    const url = "https://z.example.test/submit/all/abc";
    for (const lead of ["Enter them on one page", "Or enter them on one page"]) expect(appendedLink(`Hi\n1. Revenue\n\n${lead}: ${url}`, OWN)).toBe(url);
    expect(buttonTo(url, OWN)).toEqual({ url, label: "Fill in your numbers" });
    expect(buttonTo("https://z.example.test/submit/tk-1", OWN).label).toBe("Open your form");
    // The button says the first sentence itself; the second keeps its "Or".
    expect(aroundAction(`Hi\nEnter them on one page: ${url}`, url).before).toBe("Hi");
    expect(aroundAction(`Hi\nOr enter them on one page: ${url}`, url).before).toBe("Hi\nOr enter them on one page.");
  });
});

describe("a link in the words", () => {
  it("shows its host and the start of its path, never more or something else", () => {
    expect(shownTarget("https://z.example.test/api/unsubscribe/abcdefghijklmnop")).toBe("z.example.test/api/unsubscribe/abc…");
    expect(shownTarget("https://z.example.test@evil.test/")).toBe("evil.test");
    expect(shownTarget("https://evil.test:8443/a?b=1#c")).toBe("evil.test:8443/a?b=1#c");
    expect(shownTarget("https://[")).toBe("Link");
  });
  it("is broken in a name", () => expect(unlinked("A https://x.test HTTP://y.test")).toBe("A https: //x.test HTTP: //y.test"));
});

describe("the plain-text part", () => {
  const added = ["https://z.example.test/submit/tk-a_b-", "https://z.example.test/x?a=1&b=2"];
  it("puts an address Ziffr added on its own line in angle brackets, keeping words, indent and the token", () => {
    const text = `Hi\r\n\r\nOpen: ${added[0]}\n  ${added[1]}`;
    const once = plainWords(text, added);
    expect(once).toBe(`Hi\n\nOpen:\n<${added[0]}>\n  <${added[1]}>`);
    expect(plainWords(once, added)).toBe(once);
    expect(linkLine(`<${added[1]}>`, added)?.url).toBe(added[1]);
  });
  it("leaves quoted words, other addresses and addresses inside a sentence as written", () => {
    for (const line of [`> see ${added[0]}`, "Open: https://z.example.test/submit/theirs", `${added[0]} is the one`]) expect(plainWords(line, added)).toBe(line);
  });
});

describe("the button", () => {
  it("is worded by where Ziffr's address leads", () => {
    expect(buttonTo("https://z.example.test", OWN)).toEqual({ url: "https://z.example.test", label: "Open Ziffr" });
    expect(buttonTo("https://z.example.test/actions/1", OWN).label).toBe("Open in Ziffr");
  });
  it("takes the place of its line, keeping words only where the button does not say them", () => {
    const url = "https://z.example.test/actions/1";
    expect(aroundAction(`Hi\n\nOpen: ${url}\n\nBye`, url)).toEqual({ before: "Hi", after: "\nBye" });
    expect(aroundAction(`Hi\n\nAnswer here: ${url}`, url)).toEqual({ before: "Hi\n\nAnswer here.", after: "" });
    expect(aroundAction(`Open this to sign in:\n\n<${url}>`, url)).toEqual({ before: "Open this to sign in.", after: "" });
    expect(aroundAction("No address", url)).toEqual({ before: "No address", after: "" });
  });
});
