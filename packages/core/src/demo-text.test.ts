import { describe, expect, it } from "vitest";
import { demoTextOk } from "./demo-text";
import { DEMO_TEXT_MAX, demoDeckStoreOk, DEMO_DECK_STORE_MAX_BYTES, DEMO_ROW_CAPS } from "./demo-limits";
import { DEMO_TEXT_WORDS, demoLimitKinds, demoLimitWords } from "./demo-words";

// Characters are written as code points, so no invisible one sits in this file.
const cp = (...n: number[]) => String.fromCodePoint(...n);
const ok = (t: string, kind: "name" | "description" | "message" | "tag" = "name") => demoTextOk(t, kind);

describe("demoTextOk", () => {
  it("passes plain text, trimmed, and what is not a link", () => {
    expect(ok("  Revenue Q3  ")).toEqual({ ok: true, text: "Revenue Q3" });
    expect(ok("a < b and b > c", "message").ok).toBe(true);
    for (const fine of ["Q3: results", "e.g. the best", "Version 2.5 is out", "Net revenue. Then costs", "Sales (EU)", "50% of 3.14"]) expect(ok(fine, "message").ok, fine).toBe(true);
  });

  it("refuses empty text and text that is only hidden or blank-looking characters", () => {
    expect(ok("   ").ok).toBe(false);
    for (const blank of [cp(0x200b, 0x202e), cp(0x3164), cp(0x115f, 0x1160), cp(0x2800), cp(0xad), cp(0x2028, 0x2029), cp(0xe0041, 0xe0042), cp(0xffa0)]) expect(ok(blank).ok).toBe(false);
  });

  it("holds each kind's length in characters people see, one over refused", () => {
    for (const kind of ["name", "description", "message", "tag"] as const) {
      expect(ok("a".repeat(DEMO_TEXT_MAX[kind]), kind).ok).toBe(true);
      expect(ok("a".repeat(DEMO_TEXT_MAX[kind] + 1), kind)).toEqual({ ok: false, words: DEMO_TEXT_WORDS.long });
    }
    expect(ok(cp(0x1f600).repeat(DEMO_TEXT_MAX.tag), "tag").ok).toBe(true);
    expect(ok("x".repeat(100_000), "message").ok).toBe(false);
  });

  it("strips bidirectional controls, zero-width characters, soft hyphens, separators and tag characters", () => {
    expect(ok("ab" + cp(0x202e) + "cd" + cp(0x200b) + "ef" + cp(0xfeff, 0xad, 0x2028))).toEqual({ ok: true, text: "abcdef" });
    expect(ok(cp(0x2066) + "x" + cp(0x2069))).toEqual({ ok: true, text: "x" });
    expect(ok("go" + cp(0xe0067, 0xe006f) + "od")).toEqual({ ok: true, text: "good" });
    expect(ok("a" + cp(0x3164, 0x2800) + "b")).toEqual({ ok: true, text: "ab" });
  });

  it("keeps a joiner or non-joiner inside a word and drops one that joins nothing", () => {
    const persian = "می" + cp(0x200c) + "خواهم";
    expect(ok(persian)).toEqual({ ok: true, text: persian });
    const family = cp(0x1f469, 0x200d, 0x1f467);
    expect(ok(family)).toEqual({ ok: true, text: family });
    expect(ok(cp(0x200d) + "a" + cp(0x200c))).toEqual({ ok: true, text: "a" });
    expect(ok("a " + cp(0x200d) + " b")).toEqual({ ok: true, text: "a  b" });
    expect(ok(cp(0x200c, 0x200d))).toEqual({ ok: false, words: DEMO_TEXT_WORDS.empty });
  });

  it("allows up to three combining marks in a row and refuses more", () => {
    expect(ok("x" + cp(0x301, 0x302, 0x303)).ok).toBe(true);
    expect(ok("x" + cp(0x301, 0x302, 0x303, 0x304))).toEqual({ ok: false, words: DEMO_TEXT_WORDS.characters });
    expect(ok("Z" + cp(0x351, 0x35b, 0x33f, 0x0312, 0x0310).repeat(4))).toEqual({ ok: false, words: DEMO_TEXT_WORDS.characters });
  });

  it("normalises to NFKC before checking, so full-width forms are seen as what they look like", () => {
    expect(ok(cp(0xff1c) + "script>")).toEqual({ ok: false, words: DEMO_TEXT_WORDS.markup });
    expect(ok(cp(0xff48, 0xff54, 0xff54, 0xff50, 0xff53, 0xff1a, 0xff0f, 0xff0f) + "x")).toEqual({ ok: false, words: DEMO_TEXT_WORDS.link });
    expect(ok("example" + cp(0xff0e) + "com")).toEqual({ ok: false, words: DEMO_TEXT_WORDS.link });
    expect(ok(cp(0xff37, 0xff37, 0xff37, 0xff0e) + "x")).toEqual({ ok: false, words: DEMO_TEXT_WORDS.link });
    expect(ok(cp(0x2460) + " first")).toEqual({ ok: true, text: "1 first" });
  });

  it("refuses control characters; a message may keep a new line and a tab", () => {
    expect(ok("a\u0000b").ok).toBe(false);
    expect(ok("a\nb").ok).toBe(false);
    expect(ok("a" + cp(0x85) + "b", "message").ok).toBe(false);
    expect(ok("a\nb\tc", "message").ok).toBe(true);
  });

  it("refuses tags", () => {
    for (const bad of ["<script>x</script>", "a </b", "<!-- x", "<?xml"]) expect(ok(bad, "message").ok).toBe(false);
  });

  it("refuses every way of writing a web, email or markdown link, in every kind of text", () => {
    const links = [
      "see https://example.com", "ftp://x", "javascript://x", "//evil.example", "go to //x",
      "WWW.example.com", "www.x", "example.com", "example.com/path", "visit example.com now", "sub.example.co.uk/x",
      "example[.]com", "example(.)com", "example[dot]com", "a-b.io:8080", "x.dev?q=1", "x.dev#top",
      "mailto:a@b.co", "data:text/html,hi", "javascript:alert(1)", "vbscript:x", "file:x", "tel:123",
      "a@b.co", "write to me@example.com", "[click here](x)", "[a] (b)",
    ];
    for (const bad of links) for (const kind of ["name", "description", "message", "tag"] as const) expect(ok(bad, kind), `${bad} (${kind})`).toEqual({ ok: false, words: DEMO_TEXT_WORDS.link });
  });
});

describe("the limits' numbers and words", () => {
  it("every kind of row cap has words, and the numbers are the spec's", () => {
    expect(demoLimitKinds().sort()).toEqual(Object.keys(DEMO_ROW_CAPS).sort());
    expect(DEMO_ROW_CAPS).toMatchObject({ dashboards: 25, widgets_per_dashboard: 40, saved_widgets: 50, decks: 15, snapshots: 20, metrics: 15, templates: 15, workflows: 10, groups: 10, tags: 20, open_actions: 300, values: 2000 });
    expect(demoLimitWords("dashboards")).toContain("dashboards");
    expect(demoLimitWords("nonsense")).toMatch(/full/);
    expect(demoLimitWords("starting")).toBe("The demo is starting fresh. Try again in a moment.");
  });

  it("a deck's store is at most 512 KB in bytes", () => {
    expect(demoDeckStoreOk("a".repeat(DEMO_DECK_STORE_MAX_BYTES))).toBe(true);
    expect(demoDeckStoreOk("a".repeat(DEMO_DECK_STORE_MAX_BYTES + 1))).toBe(false);
    expect(demoDeckStoreOk(cp(0xe9).repeat(DEMO_DECK_STORE_MAX_BYTES / 2 + 1))).toBe(false);
  });
});
