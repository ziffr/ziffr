// An Invitation's page (GLOSSARY: Invitation): which workspace and role it offers, and joining it. Only for people
// who have signed in; the middleware sends everyone else to sign in first and back here.
import { invitationFor } from "@ziffr/core/invitations";
import { redirect } from "next/navigation";
import { demoOnly, signedIn } from "@/lib/auth";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { JoinButton } from "./join";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", guest: "Guest" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  // Nobody joins anything in a demo-only Ziffr; the way in is the demo.
  if (demoOnly()) redirect("/login");
  const { token } = await params;
  const [info, who] = await Promise.all([invitationFor(token), signedIn()]);
  if (!info || !info.usable) {
    return (
      <AuthShell>
        <AuthHeading title="This invitation does not work any more">It may have ended, been used or been revoked. Ask whoever invited you for a new one.</AuthHeading>
      </AuthShell>
    );
  }
  const wrongAddress = info.forEmail && info.forEmail !== who?.verifiedEmail;
  return (
    <AuthShell>
      <AuthHeading title={info.trial ? `Join a trial of Ziffr: ${info.workspace}` : `Join ${info.workspace}`}>
        {info.trial ? `${info.trial.words} You are invited as ${ROLE[info.role]}.` : `You are invited as ${ROLE[info.role]}.`}
      </AuthHeading>
      {wrongAddress ? (
        <p className="mt-6 text-sm">This invitation is for {info.forEmail}. Sign out and sign in with that address to accept it.</p>
      ) : (
        <JoinButton token={token} />
      )}
    </AuthShell>
  );
}
