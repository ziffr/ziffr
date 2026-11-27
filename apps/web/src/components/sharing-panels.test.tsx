// @vitest-environment happy-dom
// Sharing in the side panel (spec 0050, ticket #925): Share, Who can see this and View links open in the one host, show
// their content, close with the host, and Share keeps `?panel=share` as its address. Server actions are replaced.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboards/1",
  useRouter: () => ({ refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/app/access-actions", () => ({
  whoCanSee: async () => ({ owner: "p1", requests: [], people: [{ person: "p2", how: ["Shared as Viewer"] }] }),
  decideAccess: async () => ({}),
  requestAccess: async () => "",
}));
vi.mock("@/app/view-link-actions", () => ({
  listViewLinks: async () => [{ id: 1, label: "Advisory board", token: "t", revoked: false, expires_at: "2999-01-01", frozen: false, showNames: false, snapshotLabel: null }],
  createViewLink: async () => ({ ok: true, value: "t" }),
  fixListsForLink: async () => ({}),
  revokeViewLink: async () => ({}),
  setViewLinkNames: async () => ({}),
  shownSnapshots: async () => [],
  tagListsToFix: async () => 0,
  emptyInLink: async () => [],
  deletedInLink: async () => [],
}));
vi.mock("@/app/canvas-actions", () => ({ setShare: async () => ({}), setGroupShare: async () => ({}) }));
vi.mock("@/app/team-actions", () => ({ inviteMember: async () => ({}), inviteGateNow: async () => ({ state: "ended" }) }));
vi.mock("@/app/series-actions", () => ({ askMeNow: async () => ({}), recordValue: async () => ({}) }));
vi.mock("@/app/value-note-actions", () => ({ saveFormNote: async () => ({ saved: true, detail: "Your note was saved." }) }));
vi.mock("@/app/deck-actions", () => ({ deckShareLeftOut: async () => ({ who: { p2: [{ from: "Sales, Q3 2026", count: 3 }] }, unnamed: 1 }) }));
import { SlideOverProvider } from "./slide-over-host";
import { ShareSheet } from "./share-sheet";
import { useShowWhoCanSee } from "./who-can-see";
import { useShowViewLinks } from "./view-links";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const people = [
  { id: "p1", name: "Owen Owner", color: "#000", role: "Owner" },
  { id: "p2", name: "Vera Viewer", color: "#111", role: "Member" },
] as never[];

function Page() {
  const who = useShowWhoCanSee(people);
  const links = useShowViewLinks();
  return (
    <ShareSheet
      objectType="dashboard" objectId={1} name="Board" ownerId="p1" people={people} shares={[]} primary
      more={[
        { label: "Who can see this", icon: null, onClick: () => who("dashboard", 1) },
        { label: "View links for outsiders", icon: null, onClick: () => links("dashboard", 1) },
      ]}
    />
  );
}

let host: HTMLElement; let root: Root;
const panel = () => document.querySelector<HTMLElement>("[data-slide-over]");
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const button = (text: string) => [...(panel() ?? document).querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
const mount = () => act(async () => { root.render(<SlideOverProvider><Page /></SlideOverProvider>); });

beforeEach(async () => {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; window.history.replaceState(null, "", "/"); });

describe("Share in the side panel", () => {
  it("opens from the Share button with its content and puts ?panel=share in the address", async () => {
    await mount();
    expect(panel()).toBeNull();
    await act(async () => button("Share").click()); await tick();
    expect(panel()!.textContent).toContain("Share “Board”");
    expect(panel()!.textContent).toContain("Vera Viewer");
    expect(panel()!.dataset.short).toBe("true");
    expect(new URL(window.location.href).searchParams.get("panel")).toBe("share");
  });

  it("opens by itself from a link with ?panel=share", async () => {
    window.history.replaceState(null, "", "/dashboards/1?panel=share");
    await mount(); await tick();
    expect(panel()!.textContent).toContain("Vera Viewer");
    // The address keeps naming the open panel, so a reload or a copied link shows the same, and closing removes it.
    expect(new URL(window.location.href).searchParams.get("panel")).toBe("share");
    await act(async () => button("Close").click()); await tick();
    expect(panel()).toBeNull();
    expect(new URL(window.location.href).searchParams.has("panel")).toBe(false);
  });

  it("takes ?panel=share out of the address when it closes", async () => {
    await mount();
    await act(async () => button("Share").click()); await tick();
    await act(async () => button("Close").click()); await tick();
    expect(new URL(window.location.href).searchParams.has("panel")).toBe(false);
  });

  it("says why Invite someone is closed, right above its greyed fields", async () => {
    await act(async () => { root.render(<SlideOverProvider><ShareSheet objectType="deck" objectId={2} name="Review" ownerId="p1" people={people} shares={[]} canInvite /></SlideOverProvider>); });
    await act(async () => button("Share").click()); await tick();
    await act(async () => button("Invite someone").click()); await tick();
    expect(panel()!.textContent).toContain("This trial has ended, so nobody can be invited any more.");
    expect(panel()!.querySelector<HTMLInputElement>('input[type="email"]')!.disabled).toBe(true);
    expect(button("Invite").disabled).toBe(true);
  });

  it("says on a deck, before anything is shared, who will not see which Snapshot Parts", async () => {
    await act(async () => { root.render(<SlideOverProvider><ShareSheet objectType="deck" objectId={2} name="Review" ownerId="p1" people={people} shares={[]} /></SlideOverProvider>); });
    await act(async () => button("Share").click()); await tick();
    expect(panel()!.textContent).toContain("Cannot see 3 Snapshot Parts (Sales, Q3 2026). Ask the dashboard's owner to share it.");
    expect(panel()!.textContent).toContain("does not show anyone the numbers its slides keep from a Snapshot");
    expect(panel()!.textContent).toContain("One part shows nothing to you");
  });

  it("opens Who can see this and View links on top, with Back to Share", async () => {
    await mount();
    await act(async () => button("Share").click()); await tick();
    await act(async () => button("Who can see this").click()); await tick();
    expect(panel()!.textContent).toContain("Who can see this");
    expect(panel()!.textContent).toContain("Shared as Viewer");
    // All three are short panels: a bottom sheet on a phone (spec 0055), so the panel does not change shape between them.
    expect(panel()!.dataset.short).toBe("true");
    await act(async () => button("Back").click()); await tick();
    expect(panel()!.textContent).toContain("Share “Board”");
    await act(async () => button("View links for outsiders").click()); await tick();
    expect(panel()!.textContent).toContain("Advisory board");
    expect(panel()!.textContent).toContain("Make link and copy it");
    expect(panel()!.dataset.short).toBe("true");
  });
});
