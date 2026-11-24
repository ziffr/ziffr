// @vitest-environment node
// About you and its step bar (spec 0052, ticket 3; GLOSSARY: Setup Guide): what each question says it is for, the exact
// privacy statement, one labelled control per question, the state of each step in words, and a Member's version.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("sonner", () => ({ toast: { success() {}, error() {} } }));
vi.mock("./actions", () => ({ saveAboutYou: async () => ({}), skipStep: async () => ({}) }));
import { AboutYouMember, AboutYouWorkspace } from "./about-you";
import { StepBar } from "./step-bar";
import { PRIVACY_STATEMENT } from "@/components/privacy-statement";
import { SETUP_STEPS } from "@ziffr/core/setup-steps";

const empty = { industry: null, segment: null, country: null, currency: null, employeeBand: null, revenueBand: null };
const owner = renderToStaticMarkup(<AboutYouWorkspace profile={empty} countries={[{ code: "DE", name: "Germany" }]} timeZone="UTC" runHour={8} yearStart={1} allowedMonths={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]} whyMonths={null} businessFunction={null} following="start" />);

describe("About you for Owners and Admins", () => {
  it("asks the nine questions, each with a label and what it is for", () => {
    const labels = [...owner.matchAll(/<label for="(about-[a-z]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["about-industry", "about-segment", "about-country", "about-people", "about-revenue", "about-function", "about-zone", "about-hour", "about-year"]);
    // The section line says what the business questions are for; the others say what they are used for themselves.
    const specific = labels.filter((id) => !["about-industry", "about-segment", "about-people"].includes(id));
    for (const id of specific) {
      expect(owner).toContain(`id="${id}-hint"`);
      expect(owner).toContain(`<select id="${id}" aria-describedby="${id}-hint"`);
    }
    expect(owner).toContain("So numbers and money are written the way you write them.");
    expect(owner).toContain("In the currency above, roughly.");
  });

  it("lets every question be skipped and says the privacy statement in the spec's words", () => {
    expect(owner).toContain("Skip this question");
    expect(owner.replaceAll("&#x27;", "'")).toContain(PRIVACY_STATEMENT);
    expect(PRIVACY_STATEMENT).toBe("What you answer here stays in this Workspace. It is not sent to Ziffr's makers or to anyone else. It is used only inside this Workspace, to suggest Metrics, Packs and settings that fit and who is asked for what. Owners and Admins of this Workspace see your function; other members do not.");
  });
});

describe("About you for a Member", () => {
  const member = renderToStaticMarkup(<AboutYouMember answers={[{ label: "What it does", value: "Software and SaaS" }]} businessFunction="sales" following="ways" />);
  it("shows the Workspace's answers read-only and asks only the function", () => {
    expect(member).toContain("Software and SaaS");
    expect(member).toContain('id="about-function"');
    expect(member).not.toContain('id="about-industry"');
    expect(member).not.toContain('id="about-zone"');
  });
  it("says when nobody has answered the business questions", () => {
    expect(renderToStaticMarkup(<AboutYouMember answers={[]} businessFunction={null} following="ways" />)).toContain("have not said yet");
  });
});

describe("the step bar", () => {
  it("lists the steps in order with their state in words and marks the current one", () => {
    const steps = SETUP_STEPS.map((id) => ({ id, ticked: id === "about", skipped: id === "ways", done: false, next: false }));
    const html = renderToStaticMarkup(<StepBar steps={steps} current="start" />);
    expect(html).toContain('aria-label="Setup steps"');
    expect(html.match(/<li>/g)?.length).toBe(5);
    expect(html).toContain("Done");
    expect(html).toContain("Skipped");
    expect(html).toContain("Comes next");
    expect(html.match(/aria-current="step"/g)?.length).toBe(1);
    // Every step is a link that goes somewhere: its own screen.
    for (const id of SETUP_STEPS) expect(html).toContain(`href="/setup?step=${id}"`);
  });
});
