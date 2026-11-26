// Where a Pack's numbers come from, as a page draws it (spec 0058, GLOSSARY: Comes From): the table, "Included" and
// "What you still need", and a stranger's words only ever as text.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PackNumbersView } from "./pack-numbers";
import type { KeptOverview } from "@ziffr/pack/comes-from";

const overview: KeptOverview = {
  numbers: [
    { key: "closed", name: "Closed this quarter", by: "system", system: "CRM", note: "<img src=x onerror=alert(1)> https://evil.example", templates: ["google-sheets"] },
    { key: "gap", name: "Gap", by: "calculated", of: ["Closed this quarter"] },
    { key: "hours", name: "Hours", by: "unsaid" },
  ],
  workflows: [{ name: "Weekly", does: ["asks", "approves"], approvers: 1 }],
  dashboards: ["Forecast"], decks: [], views: [], themes: [], targets: [],
};

describe("where a Pack's numbers come from", () => {
  const html = renderToStaticMarkup(<PackNumbersView overview={overview} />);

  it("lists every number with where it comes from, what is included and what is still needed", () => {
    for (const words of ["Where the numbers come from", "Another system sends it: CRM", "Comes with an n8n template for Google Sheets; you connect it.", "Ziffr calculates it from Closed this quarter", "The Pack does not say", "Included", "Dashboard: Forecast", "What you still need", "An Approver for the Workflow Weekly"]) expect(html, words).toContain(words);
    expect(html).toContain("<th scope=\"row\"");
  });

  it("draws a stranger's words as text, never as an element or a link", () => {
    for (const tag of ["<img", "<a ", "href=\""]) expect(html, tag).not.toContain(tag);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
