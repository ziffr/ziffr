// @ts-nocheck
import { describe, expect, it } from "vitest";
import { CORE_API_VERSION } from "./index";

describe("@ziffr/core", () => {
  it("exposes its interface version", () => {
    expect(CORE_API_VERSION).toBe(1);
  });
});
