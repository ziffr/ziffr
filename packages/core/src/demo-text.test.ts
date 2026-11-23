import { describe, expect, it } from "vitest";
import { demoTextOk } from "./demo-text";
import { DEMO_TEXT_MAX, demoDeckStoreOk, DEMO_DECK_STORE_MAX_BYTES, DEMO_ROW_CAPS } from "./demo-limits";
import { demoLimitKinds, demoLimitWords } from "./demo-words";

describe("demoTextOk", () => {
  it("passes plain text, trimmed", () => {
    expect(demoTextOk("  Revenue Q3  ", "name")).toEqual({ ok: true, text: "Revenue Q3" });
    expect(demoTextOk("a < b and b > c", "message").ok).toBe(true);
  });

  it("refuses empty text", () => {
    expect(demoTextOk("   ", "name").ok).toBe(false);
    expect(demoTextOk("​‮", "name").ok).toBe(false);
  });

  it("holds each kind's length in characters people see, one over refused", () => {
    for (const kind of ["name", "description", "message", "tag"] as const) {
      expect(demoTextOk("a".repeat(DEMO_TEXT_MAX[kind]), kind).ok).toBe(true);
      expect(demoTextOk("a".repeat(DEMO_TEXT_MAX[kind] + 1), kind).ok).toBe(false);
    }
    expect(demoTextOk("\u{1F600}".repeat(DEMO_TEXT_MAX.tag), "tag").ok).toBe(true);
    expect(demoTextOk("x".repeat(100_000), "message").ok).toBe(false);
  });

  it("strips bidirectional controls and zero-width characters", () => {
    expect(demoTextOk("ab‮cd​ef﻿", "name")).toEqual({ ok: true, text: "abcdef" });
    expect(demoTextOk("⁦x⁩", "name")).toEqual({ ok: true, text: "x" });
  });

  it("refuses control characters; a message may keep a new line and a tab", () => {
    expect(demoTextOk("a\u0000b", "name").ok).toBe(false);
    expect(demoTextOk("a\nb", "name").ok).toBe(false);
    expect(demoTextOk("a\u0085b", "message").ok).toBe(false);
    expect(demoTextOk("a\nb\tc", "message").ok).toBe(true);
  });

  it("refuses tags", () => {
    for (const bad of ["<script>x</script>", "a </b", "<!-- x", "<?xml"]) expect(demoTextOk(bad, "message").ok).toBe(false);
  });

  it("refuses web addresses in a name or Tag, and lets a message keep one as plain text", () => {
    for (const bad of ["see https://example.com", "WWW.example.com", "javascript://x"]) {
      expect(demoTextOk(bad, "name").ok).toBe(false);
      expect(demoTextOk(bad, "tag").ok).toBe(false);
    }
    expect(demoTextOk("see https://example.com", "message").ok).toBe(true);
  });
});

describe("the limits' numbers and words", () => {
  it("every kind of row cap has words, and the numbers are the spec's", () => {
    expect(demoLimitKinds().sort()).toEqual(Object.keys(DEMO_ROW_CAPS).sort());
    expect(DEMO_ROW_CAPS).toMatchObject({ dashboards: 25, widgets_per_dashboard: 40, saved_widgets: 50, decks: 15, snapshots: 20, metrics: 15, templates: 15, workflows: 10, groups: 10, tags: 20, open_actions: 300, values: 2000 });
    expect(demoLimitWords("dashboards")).toContain("dashboards");
    expect(demoLimitWords("nonsense")).toMatch(/full/);
  });

  it("a deck's store is at most 512 KB in bytes", () => {
    expect(demoDeckStoreOk("a".repeat(DEMO_DECK_STORE_MAX_BYTES))).toBe(true);
    expect(demoDeckStoreOk("a".repeat(DEMO_DECK_STORE_MAX_BYTES + 1))).toBe(false);
    expect(demoDeckStoreOk("é".repeat(DEMO_DECK_STORE_MAX_BYTES / 2 + 1))).toBe(false);
  });
});
