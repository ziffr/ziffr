import { describe, expect, it } from "vitest";
import { fillText, listOf } from "./placeholders";
import { canvas, metric, months } from "./test/fixtures";

const revenue = metric();
const orders = metric({ id: 2, slug: "orders", name: "Orders", format: "number", unit: "" });
const data = canvas([revenue, orders], { revenue: months("2025-10", [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 120]), orders: months("2026-10", [7]) });

describe("placeholders", () => {
  it("fills words from the data", () => {
    expect(fillText("{metric} in {period}: {latest}", [revenue], data)).toBe("Revenue in October 2026: 120 €");
    expect(fillText("{metric} {change yoy}", [revenue], data)).toBe("Revenue up 20.0 %");
  });
  it("numbers further metrics and lists them all", () => {
    expect(fillText("{metric 2}", [revenue, orders], data)).toBe("Orders");
    expect(fillText("{metrics}", [revenue, orders], data)).toBe("Revenue and Orders");
    expect(listOf(["A", "B", "C"])).toBe("A, B and C");
  });
  it("leaves a placeholder it cannot fill visible", () => {
    expect(fillText("{metric 3} {top row}", [revenue], data)).toBe("{metric 3} {top row}");
  });
});
