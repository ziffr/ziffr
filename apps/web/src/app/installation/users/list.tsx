"use client";
// The Users and what an Installation Admin may do with one (spec 0066; GLOSSARY: User, Blocked User): block, unblock
// and sign out everywhere, each asked for again before it happens. It holds only what the page shows; the core decides.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { InstallationUser } from "@ziffr/core/installation-users";
import { blockUser, signOutUser, unblockUser } from "@/app/installation-actions";
import { useConfirm, type ConfirmOptions } from "@/components/confirm-dialog";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { PanelBadge } from "../panel-list";

const STATUS = { active: "Active", blocked: "Blocked", never_signed_in: "Never signed in" } as const;

/** One card per User, newest sign-up first. */
export function UserList({ users }: { users: InstallationUser[] }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm" aria-label="Users">
        {users.map((u) => <UserRow key={u.userId} user={u} confirm={confirm} />)}
      </ul>
    </>
  );
}

/** One User: who they are, how they stand and the actions their standing allows. */
function UserRow({ user: u, confirm }: { user: InstallationUser; confirm: (o: ConfirmOptions) => Promise<boolean> }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const who = u.name || u.email || "This User";
  const ask = async (question: ConfirmOptions, action: (id: string) => Promise<{ error: string } | { ok: true; message?: string }>) => {
    if (!(await confirm(question))) return;
    start(async () => {
      const r = await action(u.userId);
      if ("error" in r) toast.error("Not done", { description: r.error });
      else toast.success(r.message ?? "Done.");
      router.refresh();
    });
  };
  const mayBlock = !u.you && !u.installationAdmin;
  return (
    <li className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words font-medium">{u.name || "No name yet"}{u.you && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
          <PanelBadge strong={u.status === "blocked"}>{STATUS[u.status]}</PanelBadge>
          {u.installationAdmin && <PanelBadge>Installation Admin</PanelBadge>}
        </p>
        <p className="break-all text-muted-foreground">{u.email ?? "No email address"}</p>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>Signed up {u.signedUpAt ? <RelativeTime at={u.signedUpAt} /> : "at an unknown time"}</span>
          <span>Last sign-in {u.lastSignInAt ? <RelativeTime at={u.lastSignInAt} /> : "never"}</span>
          <span className="fig">{u.workspaces} Workspace{u.workspaces === 1 ? "" : "s"}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={`Sign ${who} out everywhere`}
          onClick={() => ask({
            title: `Sign ${who} out everywhere?`,
            description: u.you ? "Every browser and app of yours must sign in again, this one included. Access Keys and connected assistants keep working." : "Every browser and app of theirs must sign in again. Access Keys and connected assistants keep working.",
            confirmLabel: "Sign out everywhere", destructive: false,
          }, signOutUser)}>
          Sign out everywhere
        </Button>
        {u.status === "blocked" ? (
          <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={`Unblock ${who}`}
            onClick={() => ask({ title: `Unblock ${who}?`, description: "They can sign in again, and their keys, assistants, links and replies work as before. If someone else may have had the account, revoke their keys first.", confirmLabel: "Unblock", destructive: false }, unblockUser)}>
            Unblock
          </Button>
        ) : mayBlock && (
          <Button type="button" variant="destructive" size="sm" disabled={pending} aria-label={`Block ${who}`}
            onClick={() => ask({
              title: `Block ${who}?`,
              description: "They are signed out everywhere and cannot sign in. Their Access Keys, connected assistants, Personal Webhooks, form links, Calendar Links and replies stop working, and no message is sent to them, until you unblock them. Their Workspaces and what they shared stay as they are.",
              confirmLabel: "Block",
            }, blockUser)}>
            Block
          </Button>
        )}
      </div>
    </li>
  );
}
