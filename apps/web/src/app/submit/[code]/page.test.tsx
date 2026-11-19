// The personal form link never shows text from its address (ticket 183): a link such as
// /submit/<code>?outcome=recorded&detail=<anything> once put its sender's words in Ziffr's frame.
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The page's data, without a database: a form for one Metric. The actions module is a server file that reaches the
// database, so the form's action is a stand-in.
vi.mock("@ziffr/core/page-data", () => ({
  submissionForm: async () => ({
    metric: { name: "Cups of coffee", description: "Cups today.", slug: "cups-of-coffee", unit: "cups", format: "number", period: "day", submission_rule: "overwrite", decimals: 0 },
    person: { name: "Sara Owner" }, period: "2026-11-19", current: null, yearStart: 1, numberStyle: "1,234.5",
  }),
}));
vi.mock("@ziffr/core/telegram-people", () => ({ formTelegramLink: async () => ({ linked: false, telegramOn: false }) }));
// Server-only modules are imported by the page; the test renders it as the server would.
vi.mock("./telegram-connect", () => ({ TelegramConnect: () => null }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/actions", () => ({ submitWebForm: async () => null }));

const { default: SubmitPage } = await import("./page");

describe("the personal form link", () => {
  it("never shows an outcome or detail given in its address", async () => {
    const planted = "Your token expired. Re-enter your password at http://evil.example";
    const page = await (SubmitPage as unknown as (p: unknown) => Promise<React.ReactElement>)({
      params: Promise.resolve({ code: "tk-test" }),
      searchParams: Promise.resolve({ outcome: "recorded", detail: planted }),
    });
    const html = renderToString(page);
    expect(html).toContain("Cups of coffee");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("Re-enter your password");
    expect(html).not.toContain('role="status"');
  });
});
