// @vitest-environment happy-dom
// The combined form's fields (spec 0064; GLOSSARY: Combined Prompt, Value Note): one Submit sends every row, what was
// recorded leaves its field and what was refused stays, and a figure no longer asked of the person has no field. The
// server action is replaced; its rules are tested in the core.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CombinedFormRow, CombinedResult } from "@ziffr/core/combined-form";

const send = vi.fn(async (_code: string, _previous: unknown, _form: FormData): Promise<CombinedResult> => ({ rows: {} }));
vi.mock("@/app/actions", () => ({ submitCombinedWebForm: (c: string, p: unknown, f: FormData) => send(c, p, f) }));
import { CombinedFields } from "./combined-fields";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const open = (position: number, name: string): CombinedFormRow => ({ position, open: true, name, description: "", periodLabel: "October 2026", has: null, rule: "reject a second value", placeholder: "Value", standingInFor: null, answeredOn: null });
const rows: CombinedFormRow[] = [open(1, "Revenue"), open(2, "Costs"), { position: 3, open: false, name: null, periodLabel: null, words: "No longer asked of you." }];

let host: HTMLElement; let root: Root;
async function mount(el: React.ReactElement) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(el); });
}
afterEach(() => { send.mockClear(); act(() => root.unmount()); host.remove(); });

const field = (name: string) => host.querySelector(`[name="${name}"]`) as HTMLInputElement;
async function type(name: string, words: string) {
  const el = field(name);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, words);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = async () => { await act(async () => { ([...host.querySelectorAll("button")].find((b) => b.textContent === "Submit") as HTMLButtonElement).click(); }); };

describe("the combined form's fields", () => {
  it("give each open figure a number, a note and a Breakdown, and one Submit; one no longer asked has none", async () => {
    await mount(<CombinedFields code="c" rows={rows} numberStyle="1,234.5" notes />);
    for (const name of ["value-1", "note-1", "breakdown-1", "value-2", "note-2", "breakdown-2"]) expect(field(name), name).not.toBeNull();
    expect(field("value-3")).toBeNull();
    expect(field("value-1").getAttribute("aria-label")).toBe("Value for Revenue, October 2026");
    expect(host.textContent).toContain("No longer asked of you.");
    expect([...host.querySelectorAll("button[type=submit]")]).toHaveLength(1);
    // Nothing leads anywhere: the form opens its own figures only.
    expect(host.querySelector("a")).toBeNull();
  });

  it("offer no note where the core says there is none", async () => {
    await mount(<CombinedFields code="c" rows={rows} numberStyle="1,234.5" notes={false} />);
    expect(field("note-1")).toBeNull();
  });

  it("empty what was recorded, keep what was refused and say what became of each row", async () => {
    send.mockResolvedValueOnce({ rows: { 1: { ok: true, detail: "45 recorded for Revenue." }, 2: { ok: false, detail: "Type a number, such as 88.", noteKept: true } } });
    await mount(<CombinedFields code="c" rows={rows} numberStyle="1,234.5" notes />);
    await type("value-1", "45"); await type("note-1", "Two fairs"); await type("value-2", "abc"); await type("note-2", "Why");
    await submit();
    const sent = send.mock.calls[0]![2];
    expect([sent.get("value-1"), sent.get("note-1"), sent.get("value-2")]).toEqual(["45", "Two fairs", "abc"]);
    expect([field("value-1").value, field("note-1").value, field("value-2").value, field("note-2").value]).toEqual(["", "", "abc", "Why"]);
    expect(host.textContent).toContain("45 recorded for Revenue.");
    expect(host.textContent).toContain("1 of 2 done.");
    expect(document.activeElement).toBe(field("value-2"));
    // A further try for the rest keeps what the first one said.
    send.mockResolvedValueOnce({ rows: { 2: { ok: true, detail: "7 recorded for Costs." } } });
    await type("value-2", "7");
    await submit();
    expect(host.textContent).toContain("45 recorded for Revenue.");
    expect(host.textContent).toContain("7 recorded for Costs.");
  });

  it("say why nothing was looked at", async () => {
    send.mockResolvedValueOnce({ rows: {}, refused: "Type at least one number." });
    await mount(<CombinedFields code="c" rows={rows} numberStyle="1,234.5" notes />);
    await submit();
    expect(host.querySelector("[role=alert]")?.textContent).toBe("Type at least one number.");
  });
});
