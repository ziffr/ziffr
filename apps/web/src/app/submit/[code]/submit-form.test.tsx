// @vitest-environment happy-dom
// The short Record a value flow (spec 0055, ticket #1134; GLOSSARY: Token, Submission Rule): saving calls the operation
// that exists, nothing of its own, and after a recorded value the phone shows what is due next. The server actions are
// replaced; their rules are tested in the core.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { ok: boolean; detail: string; noteKept?: boolean; ask?: string };
const submitWebForm = vi.fn(async (_code: string, _previous: unknown, _form: FormData): Promise<Result> => ({ ok: true, detail: "5 recorded." }));
const recordValue = vi.fn(async (_id: number, _input: unknown): Promise<Result | { error: string }> => ({ ok: true, detail: "5 recorded for October." }));
vi.mock("@/app/actions", () => ({ submitWebForm: (c: string, p: unknown, f: FormData) => submitWebForm(c, p, f) }));
vi.mock("@/app/series-actions", () => ({ recordValue: (i: number, v: unknown) => recordValue(i, v) }));
vi.mock("@/app/value-note-actions", () => ({ saveFormNote: async () => ({ saved: true, detail: "Your note was saved." }) }));
import { sendForm, SubmitForm as Form } from "./submit-form";
import { periodOffer } from "./period-choices";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const next = { href: "/schedule/submit/visits?period=2026-10-01", name: "Visits", periodLabel: "October 2026" };
let host: HTMLElement; let root: Root;
const button = (label: RegExp) => [...host.querySelectorAll("button")].find((b) => label.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
async function mount(el: React.ReactElement) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(el); });
}
const send = async () => { await act(async () => { button(/^Submit$/)!.click(); }); };
const form = () => host.querySelector("form")!;

const running = { start: "2026-11-01", label: "November 2026", has: null };
const offerOf = (asked: string[]) => periodOffer({ running, runningWords: "this month", asked: asked.map((start) => ({ start, label: start })), named: null, namedRunning: false, recent: [] });
const SubmitForm = ({ asked = [], ...props }: Omit<React.ComponentProps<typeof Form>, "offer" | "rule"> & { asked?: string[] }) => <Form {...props} offer={offerOf(asked)} rule="reject a second value" />;

beforeEach(() => { submitWebForm.mockClear(); recordValue.mockClear(); });
afterEach(() => { if (host?.isConnected) { act(() => root.unmount()); host.remove(); } });

const fields = (value: string, period?: string) => { const f = new FormData(); f.set("value", value); f.set("breakdown", ""); if (period) f.set("period", period); return f; };

describe("what saving calls", () => {
  it("is the form link's own operation for the current period, with the code", async () => {
    await sendForm("tk-abc", null)(null, fields("5"));
    expect(submitWebForm).toHaveBeenCalledWith("tk-abc", null, expect.any(FormData));
    expect(recordValue).not.toHaveBeenCalled();
  });

  it("is Record a value for a named period, and a refusal comes back in its words", async () => {
    await sendForm("tk-abc", { metricId: 7, period: "2026-10-01" })(null, fields("5"));
    expect(recordValue).toHaveBeenCalledWith(7, { value: "5", breakdown: "", period: "2026-10-01" });
    expect(submitWebForm).not.toHaveBeenCalled();
    recordValue.mockResolvedValueOnce({ error: "You do not submit this Metric." });
    expect(await sendForm("tk-abc", { metricId: 7, period: "2026-10-01" })(null, fields("5"))).toEqual({ ok: false, detail: "You do not submit this Metric." });
  });
});

describe("the period under For", () => {
  const select = () => host.querySelector("select[name=period]") as HTMLSelectElement;
  const pick = async (start: string) => { await act(async () => { select().value = start; select().dispatchEvent(new Event("change", { bubbles: true })); }); };
  const sent = () => (submitWebForm.mock.calls.at(-1)![2] as FormData).get("period");

  it("sends the newest period asked for unless another is picked, and keeps the pick after a refusal", async () => {
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" asked={["2026-10-01", "2026-09-01"]} />);
    expect(select().value).toBe("2026-10-01");
    await send();
    expect(sent()).toBe("2026-10-01");
    await act(async () => { button(/^Change it$/)!.click(); });
    submitWebForm.mockResolvedValueOnce({ ok: false, detail: "Type a number." });
    await pick("2026-11-01");
    await send();
    expect(sent()).toBe("2026-11-01");
    expect(select().value).toBe("2026-11-01");
    await send();
    expect(sent()).toBe("2026-11-01");
    // The form comes back on the period that was sent.
    await act(async () => { button(/^Change it$/)!.click(); });
    expect(select().value).toBe("2026-11-01");
  });

  it("gives way to the period to start with once the picked one stops waiting", async () => {
    const at = (asked: string[]) => <SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" asked={asked} />;
    await mount(at(["2026-10-01", "2026-09-01"]));
    await pick("2026-09-01");
    await act(async () => { root.render(at(["2026-10-01"])); });
    expect(select().value).toBe("2026-10-01");
  });

  it("sends the named period to Record a value, and another picked one to the form link", async () => {
    const named = { metricId: 7, period: "2026-08-01" };
    await sendForm("tk-abc", named)(null, fields("5", "2026-08-01"));
    expect(recordValue).toHaveBeenCalledWith(7, { value: "5", breakdown: "", period: "2026-08-01" });
    await sendForm("tk-abc", named)(null, fields("5", "2026-10-01"));
    expect(recordValue).toHaveBeenCalledTimes(1);
    expect(submitWebForm).toHaveBeenCalledWith("tk-abc", null, expect.any(FormData));
  });
});

const type = async (name: string, words: string) => {
  const el = host.querySelector(`[name=${name}]`) as HTMLInputElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, words);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("after a recorded value", () => {
  const intro = <h1>Signups</h1>;

  it("replaces the form with the thank-you screen and focuses its heading; Change it brings the form back", async () => {
    submitWebForm.mockResolvedValueOnce({ ok: true, detail: "5 recorded for Signups. Your note was saved." });
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" notes intro={intro} />);
    await type("value", "5"); await type("note", "Two fairs");
    await send();
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    const heading = host.querySelector("h1")!;
    expect(heading.textContent).toBe("Thank you");
    expect(document.activeElement).toBe(heading);
    expect(document.getElementById(heading.getAttribute("aria-describedby")!)!.textContent).toContain("5 recorded for Signups.");
    expect(host.querySelector("[role=status]")?.textContent).toContain("Note: Two fairs");
    expect(host.textContent).toContain("You can close this tab.");
    await act(async () => { button(/^Change it$/)!.click(); });
    expect(host.querySelector("h1")?.textContent).toBe("Signups");
    expect(host.textContent).not.toContain("Thank you");
    expect(document.activeElement).toBe(host.querySelector("input[name=value]"));
  });

  it("shows no note words when the note was not saved, and keeps them in the field", async () => {
    submitWebForm.mockResolvedValueOnce({ ok: true, detail: "5 recorded. Your note was not saved. The note could not be saved. The value stands.", noteKept: true });
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" notes />);
    await type("value", "5"); await type("note", "Two fairs");
    await send();
    expect(host.textContent).not.toContain("Note: Two fairs");
    await act(async () => { button(/^Change it$/)!.click(); });
    expect((host.querySelector("[name=note]") as HTMLTextAreaElement).value).toBe("Two fairs");
  });

  it("asks for a note where the answer does", async () => {
    submitWebForm.mockResolvedValueOnce({ ok: true, detail: "5 recorded.", ask: "q".repeat(43) });
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" notes />);
    await send();
    expect(host.textContent).toContain("Anything behind it? (optional)");
  });

  it("does not offer to change a period the form no longer takes", async () => {
    const at = (asked: string[]) => <SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" asked={asked} />;
    await mount(at(["2026-10-01"]));
    await send();
    await act(async () => { root.render(at([])); });
    expect(button(/^Change it$/)).toBeUndefined();
    await act(async () => { button(/Send another value/)!.click(); });
    expect(host.querySelector("form")).not.toBeNull();
  });

  it("offers the next value that is due", async () => {
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" next={next} />);
    expect(host.querySelector("a")).toBeNull();
    await send();
    expect(host.querySelector("a")?.getAttribute("href")).toBe(next.href);
    expect(host.querySelector("a")?.textContent).toContain("Next: Visits");
  });

  it("says nothing is due only to a known person, and nothing of it to a link holder", async () => {
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" nothingDue />);
    await send();
    expect(host.textContent).toContain("No other value of yours is due now.");
    act(() => root.unmount()); host.remove();
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" />);
    await send();
    expect(host.textContent).not.toContain("is due");
    expect(host.querySelector("a")).toBeNull();
  });

  it("keeps the form and what was typed after a refusal", async () => {
    submitWebForm.mockResolvedValueOnce({ ok: false, detail: "Type a number." });
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" next={next} />);
    await type("value", "abc");
    await send();
    expect(host.querySelector("[role=alert]")?.textContent).toBe("Type a number.");
    expect((host.querySelector("input[name=value]") as HTMLInputElement).value).toBe("abc");
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).not.toContain("Thank you");
  });
});

describe("the breakdown", () => {
  it("is closed behind a button, stays in the form, and stays open once opened", async () => {
    submitWebForm.mockResolvedValueOnce({ ok: false, detail: "Type a number." });
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" />);
    const part = host.querySelector("#breakdown-part")!;
    expect(part.querySelector("textarea[name=breakdown]")).not.toBeNull();
    expect(part.className).toBe("hidden");
    await act(async () => { button(/Add a breakdown/)!.click(); });
    expect(part.className).not.toContain("hidden");
    expect(document.activeElement).toBe(part.querySelector("textarea"));
    expect(button(/Add a breakdown/)).toBeUndefined();
    await send();
    expect(host.querySelector("#breakdown-part")!.className).not.toContain("hidden");
  });
});
