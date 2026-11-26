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
    { key: "tickets", name: "Tickets", by: "unsaid" },
  ],
  workflows: [{ name: "Weekly", does: ["asks", "approves"], approvers: 1 }],
  dashboards: ["Forecast"], decks: [], views: [], themes: [], targets: [],
};

describe("where a Pack's numbers come from", () => {
  const html = renderToStaticMarkup(<PackNumbersView overview={overview} />);

  it("lists every number with where it comes from, what is included and what is still needed", () => {
    for (const words of ["Where the numbers come from", "Another system sends it: CRM", "Fill it from Google Sheets (template included); you connect it.", "Ziffr calculates it from Closed this quarter", "Ask a person, or another system sends them", "Included", "Dashboard: Forecast", "What you still need", "Someone to ask, or a system that sends the values, for Hours and Tickets", "An Approver for the Workflow Weekly"]) expect(html, words).toContain(words);
    expect(html).toContain("<th scope=\"row\"");
    expect(html).not.toContain("does not say");
  });

  it("names numbers with the same answer on one row", () => {
    expect(html).toContain(">Hours, Tickets</th>");
    expect(html.match(/Ask a person, or another system sends them/g)).toHaveLength(1);
  });

  it("leaves out what is included where asked, as at Set up", () => {
    expect(renderToStaticMarkup(<PackNumbersView overview={overview} included={false} />)).not.toContain("Dashboard: Forecast");
  });

  it("draws a stranger's words as text, never as an element or a link", () => {
    for (const tag of ["<img", "<a ", "href=\""]) expect(html, tag).not.toContain(tag);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
