// @vitest-environment node
// About you and its step bar (spec 0052, ticket 3; GLOSSARY: Setup Guide): what a Member reads and answers, the exact
// privacy statement, and the state of each step in words.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("sonner", () => ({ toast: { success() {}, error() {} } }));
vi.mock("./actions", () => ({ saveAboutYou: async () => ({}), skipStep: async () => ({}) }));
import { AboutYouMember } from "./about-you";
import { StepBar } from "./step-bar";
import { PRIVACY_STATEMENT } from "@/components/privacy-statement";
import { SETUP_STEPS } from "@ziffr/core/setup-steps";

describe("About you", () => {
  const member = renderToStaticMarkup(<AboutYouMember answers={[{ label: "What it does", value: "Software and SaaS" }]} businessFunction="sales" following="ways" />);
  it("shows the Workspace's answers read-only and asks only the function, which may be skipped", () => {
    expect(member).toContain("Software and SaaS");
    expect(member).toContain('<label for="about-function"');
    expect(member).toContain('<select id="about-function" aria-describedby="about-function-hint"');
    expect(member).toContain('id="about-function-hint"');
    expect(member).not.toContain('id="about-industry"');
    expect(member).not.toContain('id="about-zone"');
    expect(member).toContain("Skip this question");
  });
  it("says the privacy statement in the spec's words", () => {
    expect(member.replaceAll("&#x27;", "'")).toContain(PRIVACY_STATEMENT);
    expect(PRIVACY_STATEMENT).toBe("What you answer here stays in this Workspace. It is not sent to Ziffr's makers or to anyone else. It is used only inside this Workspace, to suggest Metrics, Packs and settings that fit and who is asked for what. Owners and Admins of this Workspace see your function; other members do not.");
  });
  it("says when nobody has answered the business questions", () => {
    expect(renderToStaticMarkup(<AboutYouMember answers={[]} businessFunction={null} following="ways" />)).toContain("have not said yet");
  });
});

describe("the step bar", () => {
  it("lists the steps in order with their state in words and marks the current one", () => {
    const steps = SETUP_STEPS.map((id) => ({ id, ticked: id === "about", skipped: false, done: false, next: false }));
    const html = renderToStaticMarkup(<StepBar steps={steps} current="ways" />);
    expect(html).toContain('aria-label="Setup steps"');
    // The phone's strip and the wider list are both in the markup (one is hidden by CSS).
    expect(html.match(/<li>/g)?.length).toBe(4);
    expect(html).toContain("Step 2 of 2");
    expect(html).toContain("Done");
    expect(html).toContain("To do");
    expect(renderToStaticMarkup(<StepBar steps={steps.map((s) => ({ ...s, ticked: false, skipped: true }))} current="ways" />)).toContain("Skipped");
    expect(html.match(/aria-current="step"/g)?.length).toBe(2);
    // Every step is a link that goes somewhere: its own screen.
    for (const id of SETUP_STEPS) expect(html).toContain(`href="/setup?step=${id}"`);
  });
});
