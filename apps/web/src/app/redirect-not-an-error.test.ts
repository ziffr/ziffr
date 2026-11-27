// Naming a Workspace and accepting an Invitation (GLOSSARY: Workspace, Invitation) succeed with a redirect, which a
// server action call throws in the browser. Neither screen may take that signal for a failure (#1319).
import { redirect } from "next/navigation";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNEXPECTED } from "@/lib/action-error";

const seen = vi.hoisted(() => ({ set: [] as unknown[], work: [] as Promise<void>[] }));
const actions = vi.hoisted(() => ({ createWorkspace: vi.fn(), acceptInvite: vi.fn() }));
// These tests have no browser: each component is called as a function, with state and transitions that only record.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [initial, (value: unknown) => { seen.set.push(value); }],
  useTransition: () => [false, (work: () => Promise<void>) => { seen.work.push(work()); }],
}));
vi.mock("@/app/auth-actions", () => actions);

import { JoinButton } from "./invite/[token]/join";
import { WelcomeForm } from "./welcome/form";

type Handler = (e: { preventDefault(): void }) => void;

/** The first event handler of that name in what a component returned. */
function handler(node: ReactNode, name: "onSubmit" | "onClick"): Handler | undefined {
  if (Array.isArray(node)) return node.map((n: ReactNode) => handler(n, name)).find(Boolean);
  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  return (node.props[name] as Handler | undefined) ?? handler(node.props.children as ReactNode, name);
}

/** What `redirect()` throws: the real signal, so the check is the one Next.js makes. */
function redirectSignal(): unknown {
  try { redirect("/setup"); } catch (e) { return e; }
}

const screens = [
  { screen: "Create workspace", action: actions.createWorkspace, find: () => handler(WelcomeForm(), "onSubmit") },
  { screen: "Join", action: actions.acceptInvite, find: () => handler(JoinButton({ token: "t" }), "onClick") },
];

describe.each(screens)("$screen", ({ action, find }) => {
  beforeEach(() => { seen.set.length = 0; seen.work.length = 0; action.mockReset(); });

  /** Presses the control and waits for the transition it started. */
  async function press() {
    find()!({ preventDefault: () => {} });
    await seen.work[0];
  }

  it("passes a redirect on to Next.js and shows no error", async () => {
    const signal = redirectSignal();
    action.mockRejectedValue(signal);
    await expect(press()).rejects.toBe(signal);
    expect(seen.set).toEqual([]);
  });

  it("shows the general error for a failure", async () => {
    action.mockRejectedValue(new Error("fetch failed"));
    await press();
    expect(seen.set).toEqual([UNEXPECTED]);
  });

  it("shows a refusal's own words", async () => {
    action.mockResolvedValue({ error: "This invitation has ended." });
    await press();
    expect(seen.set).toEqual(["This invitation has ended."]);
  });
});
