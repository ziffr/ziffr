// An Invitation's page (GLOSSARY: Invitation): which workspace and role it offers, and joining it. Only for people
// who have signed in; the middleware sends everyone else to sign in first and back here.
import { invitationFor } from "@ziffr/core/invitations";
import { signedIn } from "@/lib/auth";
import { JoinButton } from "./join";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", guest: "Guest" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [info, who] = await Promise.all([invitationFor(token), signedIn()]);
  if (!info || !info.usable) {
    return (
      <div className="mx-auto mt-16 max-w-sm text-sm">
        <h1 className="text-[length:var(--text-2xl)] leading-tight">This invitation does not work any more</h1>
        <p className="mt-2 text-muted-foreground">It may have ended, been used or been revoked. Ask whoever invited you for a new one.</p>
      </div>
    );
  }
  const wrongAddress = info.forEmail && info.forEmail !== who?.verifiedEmail;
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Join {info.workspace}</h1>
      <p className="mt-2 text-sm text-muted-foreground">You are invited as {ROLE[info.role]}.</p>
      {wrongAddress ? (
        <p className="mt-6 text-sm">This invitation is for {info.forEmail}. Sign out and sign in with that address to accept it.</p>
      ) : (
        <JoinButton token={token} />
      )}
    </div>
  );
}
