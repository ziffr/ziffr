// @vitest-environment happy-dom
// The short Record a value flow (spec 0055, ticket #1134; GLOSSARY: Token, Submission Rule): saving calls the operation
// that exists, nothing of its own, and after a recorded value the phone shows what is due next. The server actions are
// replaced; their rules are tested in the core.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { ok: boolean; detail: string };
const submitWebForm = vi.fn(async (_code: string, _previous: unknown, _form: FormData): Promise<Result> => ({ ok: true, detail: "5 recorded." }));
const recordValue = vi.fn(async (_id: number, _input: unknown): Promise<Result | { error: string }> => ({ ok: true, detail: "5 recorded for October." }));
vi.mock("@/app/actions", () => ({ submitWebForm: (c: string, p: unknown, f: FormData) => submitWebForm(c, p, f) }));
vi.mock("@/app/series-actions", () => ({ recordValue: (i: number, v: unknown) => recordValue(i, v) }));
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
    submitWebForm.mockResolvedValueOnce({ ok: false, detail: "Type a number." });
    await pick("2026-11-01");
    await send();
    expect(sent()).toBe("2026-11-01");
    expect(select().value).toBe("2026-11-01");
    await send();
    expect(sent()).toBe("2026-11-01");
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

describe("after a recorded value", () => {
  it("offers the next value that is due and gives the form back when asked", async () => {
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" next={next} />);
    expect(host.querySelector("a")).toBeNull();
    await send();
    expect(host.querySelector("[role=status]")?.textContent).toBe("5 recorded.");
    expect(host.querySelector("a")?.getAttribute("href")).toBe(next.href);
    expect(host.querySelector("a")?.textContent).toContain("Next: Visits");
    // On a phone only: the form stays on a larger screen.
    expect(form().className).toContain("max-sm:hidden");
    await act(async () => { button(/Send another value/)!.click(); });
    expect(form().className).not.toContain("max-sm:hidden");
    expect(document.activeElement).toBe(host.querySelector("input[name=value]"));
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

  it("keeps the form after a refusal", async () => {
    submitWebForm.mockResolvedValueOnce({ ok: false, detail: "Type a number." });
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" next={next} />);
    await send();
    expect(host.querySelector("[role=alert]")?.textContent).toBe("Type a number.");
    expect(host.querySelector("a")).toBeNull();
    expect(form().className).not.toContain("max-sm:hidden");
  });
});

describe("the breakdown on a phone", () => {
  it("is behind a button, and stays in the form", async () => {
    await mount(<SubmitForm code="tk-abc" label="Signups" placeholder="Value" numberStyle="1,234.5" />);
    const part = host.querySelector("#breakdown-part")!;
    expect(part.querySelector("textarea[name=breakdown]")).not.toBeNull();
    expect(part.className).toContain("max-sm:hidden");
    await act(async () => { button(/Add a breakdown/)!.click(); });
    expect(part.className).not.toContain("max-sm:hidden");
    expect(button(/Hide the breakdown/)!.getAttribute("aria-expanded")).toBe("true");
  });
});
