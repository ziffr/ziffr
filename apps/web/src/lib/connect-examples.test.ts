// The examples on Connectors → Send values: written from the Installation's address and a Metric's slug, never with a key,
// and a name from the Workspace cannot become part of a command.
import { describe, expect, it } from "vitest";
import { examplesFor, endpointOf, bodyOf, KEY_PLACEHOLDER } from "./connect-examples";

const ADDRESS = "https://ziffr.example.org/";

describe("examples for sending a value", () => {
  it("point at this Installation and the Metric, for a Feed and for a person", () => {
    expect(endpointOf(ADDRESS, "feed", "sales")).toBe("https://ziffr.example.org/api/v1/feed/observations");
    expect(endpointOf(ADDRESS, "person", "sales")).toBe("https://ziffr.example.org/api/v1/metrics/sales/observations");
    expect(bodyOf("feed", "sales")).toEqual({ items: [{ metric: "sales", value: 42 }] });
    expect(bodyOf("person", "sales")).toEqual({ value: 42 });
    for (const route of ["feed", "person"] as const) {
      const all = examplesFor({ address: ADDRESS, route, slug: "sales" });
      expect(all.map((e) => e.id)).toEqual(["curl", "javascript", "python", "n8n"]);
      for (const e of all) { expect(e.text).toContain(endpointOf(ADDRESS, route, "sales")); expect(e.text).toContain(KEY_PLACEHOLDER[route]); expect(e.text).toContain("Idempotency-Key"); }
    }
  });
  it("hold no key, only the placeholder, and a JSON body that parses", () => {
    for (const route of ["feed", "person"] as const) for (const e of examplesFor({ address: ADDRESS, route, slug: "sales" })) {
      expect(e.text).not.toMatch(/zk_[A-Za-z0-9]{8,}|Bearer [a-z0-9]{20,}/);
      // The body in the text is exactly the JSON the endpoint takes.
      expect(e.text, e.id).toContain(JSON.stringify(bodyOf(route, "sales")));
    }
  });
  it("never lets a name become part of a command: anything but a slug or an address is replaced by a placeholder", () => {
    const hostile = ["x'; rm -rf / #", "a b", "UPPER", "$(whoami)", "../../etc", "x\n-H 'Evil: 1'", ""];
    for (const slug of hostile) for (const route of ["feed", "person"] as const) for (const e of examplesFor({ address: ADDRESS, route, slug })) {
      expect(e.text, slug).not.toMatch(/rm -rf|whoami|\/etc|Evil|UPPER/);
    }
    for (const address of ["javascript:alert(1)", "https://x'y.example", "http://a b", "", "https://h.example/$(id)"]) {
      expect(endpointOf(address, "feed", "sales")).toBe("https://YOUR-ZIFFR-ADDRESS/api/v1/feed/observations");
    }
  });
});
