// @vitest-environment happy-dom
// Adding and removing a Submitter on a Metric's page (GLOSSARY: Submitter): both say what happens before anything is
// done, nothing happens on Cancel, and the actor chooses whether the person added is asked now.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ addSubmitter: vi.fn(async () => "Nothing was sent to them now."), removeSubmitter: vi.fn(async () => undefined) }));
vi.mock("@/app/submitter-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { AddSubmitter, RemoveSubmitter } from "./submitter-controls";
import { addingWords, askNowWords, removingWords } from "./submitter-words";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLElement; let root: Root;
async function mount(node: React.ReactNode) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(node); });
}
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.clearAllMocks(); });

const button = (words: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === words)!;
const press = async (el: HTMLElement) => { await act(async () => { el.click(); }); await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };
const metric = { id: 7, webForm: true, ways: ["Web form"], workflow: false, archived: false };
const choices = [{ id: "mia", name: "Mia Contact", kind: "contact" as const }];

async function pick(id: string) {
  const select = host.querySelector("select")!;
  await act(async () => { select.value = id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await press(button("Add…"));
}

describe("adding a Submitter", () => {
  it("offers nothing when there is nobody to add", async () => {
    await mount(<AddSubmitter metric={metric} choices={[]} />);
    expect(host.textContent).toBe("");
  });

  it("says what a Contact gets and asks now only when left ticked", async () => {
    await mount(<AddSubmitter metric={metric} choices={choices} />);
    await pick("mia");
    expect(document.body.textContent).toContain("Mia Contact does not sign in.");
    expect(document.body.textContent).toContain("Ziffr makes them a personal form link for this Metric.");
    expect(actions.addSubmitter).not.toHaveBeenCalled();
    await press(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    expect(document.body.textContent).toContain("their form link does not reach them yet");
    await press(button("Add as Submitter"));
    expect(actions.addSubmitter).toHaveBeenCalledWith(7, "mia", false);
  });

  it("asks now by default, and never for an Archived Metric", async () => {
    await mount(<AddSubmitter metric={metric} choices={choices} />);
    await pick("mia");
    await press(button("Add as Submitter"));
    expect(actions.addSubmitter).toHaveBeenLastCalledWith(7, "mia", true);
    await act(async () => { root.render(<AddSubmitter metric={{ ...metric, archived: true }} choices={choices} />); });
    await pick("mia");
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    await press(button("Add as Submitter"));
    expect(actions.addSubmitter).toHaveBeenLastCalledWith(7, "mia", false);
  });
});

describe("removing a Submitter", () => {
  it("does nothing on Cancel and removes after a yes", async () => {
    await mount(<RemoveSubmitter metricId={7} personId="ben" name="Ben" says="What ends and what stays." />);
    const open = () => press(host.querySelector<HTMLButtonElement>('button[aria-label="Remove Ben from Who submits"]')!);
    await open();
    expect(document.body.textContent).toContain("What ends and what stays.");
    await press(button("Cancel"));
    expect(actions.removeSubmitter).not.toHaveBeenCalled();
    await open();
    await press([...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === "Remove")!);
    expect(actions.removeSubmitter).toHaveBeenCalledWith(7, "ben");
  });
});

describe("the words before a yes", () => {
  it("tell a person with a sign-in that they will see the Metric", () => {
    expect(addingWords({ name: "Ben", contact: false, webForm: true, ways: ["Web form"] })[0]).toContain("Ben will see this Metric");
  });

  it("name the ways when there is no Web form, and promise a Contact no link there", () => {
    const words = addingWords({ name: "Mia", contact: true, webForm: false, ways: ["Slack", "Mail"] }).join(" ");
    expect(words).toContain("they send them by Slack or Mail");
    expect(words).not.toContain("form link");
  });

  it("say who asks later", () => {
    expect(askNowWords({ askNow: false, workflow: true, contact: false })).toContain("when its Workflow next asks");
    expect(askNowWords({ askNow: false, workflow: false, contact: false })).toContain("has no Workflow");
  });

  it("say what removing ends: the link, a Stand-in, sight of the Metric and the last Submitter", () => {
    const base = { name: "Ben", contact: false, owner: false, editor: false, standIn: null, standsFor: [], otherPeople: 1, feed: false };
    expect(removingWords(base)).toContain("they no longer see this Metric");
    expect(removingWords(base)).not.toContain("Nobody else submits it");
    expect(removingWords({ ...base, owner: true })).not.toContain("no longer see");
    expect(removingWords(base)).not.toContain("only the owner");
    expect(removingWords({ ...base, editor: true })).toContain("only the owner can add them again");
    expect(removingWords({ ...base, editor: true, owner: true })).not.toContain("only the owner");
    expect(removingWords({ ...base, contact: true })).not.toContain("no longer see");
    expect(removingWords({ ...base, standIn: "Ana" })).toContain("Ana no longer stands in for them");
    expect(removingWords({ ...base, standsFor: ["Ana", "Max"] })).toContain("stays the Stand-in for Ana and Max");
    expect(removingWords({ ...base, otherPeople: 0 })).toContain("Nobody else submits it");
    expect(removingWords({ ...base, otherPeople: 0, feed: true })).toContain("A Feed still sends its values");
  });
});
