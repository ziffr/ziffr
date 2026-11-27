// The pieces a long answer is sent in (spec 0064), without a database.
import { describe, expect, it } from "vitest";
import { chunks } from "./reply-chunks";

describe("a long answer", () => {
  it("stays one message while it fits", () => {
    expect(chunks("Recorded: 45", 100)).toEqual(["Recorded: 45"]);
    expect(chunks("", 100)).toEqual([]);
  });

  it("is cut between lines, keeping every line, and a line longer than a message is cut itself", () => {
    expect(chunks("aaaa\nbbbb\ncccc", 9)).toEqual(["aaaa\nbbbb", "cccc"]);
    expect(chunks(`x\n${"y".repeat(12)}`, 5)).toEqual(["x", "yyyyy", "yyyyy", "yy"]);
  });

  it("takes at most ten messages", () => {
    expect(chunks("line\n".repeat(100), 4)).toHaveLength(10);
  });
});
