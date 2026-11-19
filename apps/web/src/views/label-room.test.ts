// The rules that keep a narrow chart's labels apart (#10).
import { describe, expect, it } from "vitest";
import { labelsThatFit, ticksThatFit } from "./label-room";

describe("labelsThatFit", () => {
  it("keeps every label when there is room", () => {
    expect([...labelsThatFit([20, 60, 100], [30, 30, 30], [2, 0, 1])].sort()).toEqual([0, 1, 2]);
  });

  it("keeps the wanted label first and drops its crowded neighbours", () => {
    // Bars 24 px apart, labels 50 px wide: the last (highlighted) one wins, then the first that keeps clear of it.
    expect([...labelsThatFit([12, 36, 60, 84, 108], [50, 50, 50, 50, 50], [4, 3, 2, 1, 0])].sort()).toEqual([1, 4]);
  });

  it("ignores indexes it has no position for", () => {
    expect([...labelsThatFit([10], [10], [3, 0])]).toEqual([0]);
  });
});

describe("ticksThatFit", () => {
  it("names every band when the names fit", () => {
    expect(ticksThatFit(4, 60, 30)).toEqual([0, 1, 2, 3]);
  });

  it("names every second or third band on a narrow axis, always the last", () => {
    expect(ticksThatFit(5, 20, 30)).toEqual([0, 2, 4]);
    expect(ticksThatFit(7, 14, 30)).toEqual([0, 3, 6]);
  });

  it("names nothing for no bands", () => {
    expect(ticksThatFit(0, 10, 10)).toEqual([]);
  });
});
