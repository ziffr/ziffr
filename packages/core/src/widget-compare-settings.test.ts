// A widget's target and Comparisons as files and the demo keep them (GLOSSARY: Comparison, Attainment).
import { describe, expect, it } from "vitest";
import { checkedSettingsShape } from "./demo-settings-shape";
import { settingsOf } from "./pack-export";

describe("a widget's target and Comparisons", () => {
  it("keeps a hidden target and an empty list of Comparisons, and writes nothing for a target that shows", () => {
    expect(settingsOf({ compare: [], compareTarget: false }, new Map()).settings).toEqual({ compare: [], compareTarget: false });
    expect(settingsOf({ compare: [], compareTarget: true }, new Map()).settings).toEqual({ compare: [] });
  });

  it("takes yes or no for the target and nothing else", () => {
    expect(checkedSettingsShape({ compareTarget: false })).toEqual({ ok: true, settings: { compareTarget: false } });
    expect(checkedSettingsShape({ compareTarget: "no" }).ok).toBe(false);
  });
});
