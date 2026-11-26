// The fixed list of screens made for a larger screen (spec 0055; GLOSSARY: Screen Link): every screen of the spec has
// words, and nothing but those paths can be what a Screen Link points to.
import { describe, expect, it } from "vitest";
import { desktopScreen } from "./desktop-screens";
import { SCREEN_LINK_SUBJECT, screenLinkLimitWords, screenLinkText } from "./screen-link-words";

describe("desktopScreen", () => {
  it.each([
    "/dashboards/12", "/decks/3", "/workflows", "/workflows?id=4", "/connectors", "/connectors/send", "/connectors/sources", "/connectors/who-gets-what",
    "/settings/packs", "/settings/library/playground", "/installation", "/installation/feedback", "/analyze", "/metrics/new",
    "/welcome/import", "/welcome/import/0f8fad5b-d9cb-469f-a165-70867728950e",
  ])("knows %s", (path) => {
    expect(desktopScreen(path)?.name).toBeTruthy();
    expect(desktopScreen(path)?.why).toMatch(/\.$/);
  });

  it.each([
    "/", "/dashboards", "/dashboards/12/present", "/decks/3/present", "/metrics/revenue", "/connectors/outbox", "/settings",
    "https://evil.example/decks/3", "//evil.example/decks/3", "/\\evil.example", "decks/3", "/decks/3/", "/decks/03", "/decks/0", "/decks/3?next=//evil.example",
    "/decks/3#x", "/decks/3\n", "/decks/3\nhttps://evil.example", " /decks/3", "/decks/../login", "/workflows?id=4&x=1", "/metrics/new?copy=1", "/dashboards/1234567890",
  ])("refuses %j", (path) => {
    expect(desktopScreen(path)).toBeNull();
  });

  it("refuses what is not a string", () => {
    for (const v of [undefined, null, 3, {}, ["/analyze"], { toString: () => "/analyze" }]) expect(desktopScreen(v)).toBeNull();
  });
});

describe("the words of a Screen Link", () => {
  it("name the screen and the Workspace, on one line and without markup", () => {
    expect(SCREEN_LINK_SUBJECT).toBe("Your link to Ziffr");
    expect(screenLinkText("Acme\n<Trading>", "a deck")).toBe("You asked for this link, to open a deck in Acme Trading on a larger screen. Sign in there if Ziffr asks. Nothing to answer.");
    expect(screenLinkText("", "Packs")).toBe("You asked for this link, to open Packs on a larger screen. Sign in there if Ziffr asks. Nothing to answer.");
  });

  it("say which limit stopped a press and when it resets", () => {
    const now = Date.parse("2026-11-26T10:00:00Z");
    expect(screenLinkLimitWords("window", "2026-11-26T10:07:00Z", 20, now)).toBe("You asked for 3 emails to yourself in the last 10 minutes. Try again in 7 minutes.");
    expect(screenLinkLimitWords("day", "2026-11-26T15:00:00Z", 5, now)).toBe("You asked for 5 messages to yourself today. Try again in 5 hours.");
  });
});
