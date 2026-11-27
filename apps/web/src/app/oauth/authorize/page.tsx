// The consent screen (spec 0023, ADR 0011, GLOSSARY: Access Key, MCP Server): an assistant such as Claude.ai sends
// the person here to connect. Signed in (the middleware sends anyone else to sign in and back), they see the name the
// assistant gave itself, marked as its own claim, and where it will send them back, and pick the Workspace, what it
// may do and until when. Approving makes an Access Key of the kind assistant. A request from an unknown assistant or
// to an address it did not register, or any other error, is shown here and never redirected.
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { checkAuthorizationRequest, claimOAuthRequest, DEFAULT_CONNECTION_DAYS, OAuthError, type AuthorizationRequest } from "@ziffr/core/assistant-connections";
import { networkAddress } from "@ziffr/core/sign-in-limits";
import { isDemo } from "@/lib/auth";
import { currentWorkspaceId, myWorkspaces, viewerId } from "@/lib/viewer";
import { remoteMcpEnabled } from "@/lib/remote-mcp";
import { ConsentForm } from "./consent-form";

export const dynamic = "force-dynamic";

// The parameters the request is checked by again when the person answers; nothing else travels in the form.
const KEPT = ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"];

const inDays =(n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!remoteMcpEnabled()) notFound();
  if (await isDemo()) return <Message title="Leave the demo first">Assistants connect only to your own workspaces. Leave the demo, sign in, and start connecting again in your assistant.</Message>;
  // A parameter given twice is left out, so the core refuses the request rather than guessing which one counts.
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].length <= 2000));
  if (!(await claimOAuthRequest("authorize", networkAddress(await headers())))) return <Message title="Try again later">Too many connections were started from here in the last hour.</Message>;
  let request: AuthorizationRequest;
  try {
    request = await checkAuthorizationRequest(params);
  } catch (e) {
    if (!(e instanceof OAuthError)) throw e;
    // Never sent back on its own: anyone can register an address, so redirecting on an error would make this page an
    // open redirect (RFC 9700, 4.11.2). The browser leaves for the assistant only when the person presses a button.
    return <Message title="This connection cannot go on">{e.message}</Message>;
  }
  const personId = await viewerId();
  // Someone with no workspace yet would otherwise be sent on to start one, and this request would be lost on the way.
  // Say so instead: the assistant starts a fresh request once they have one.
  const workspaces = await myWorkspaces(personId);
  if (!workspaces.length) {
    return (
      <Message title="Start a workspace first">
        An assistant connects to one of your workspaces, and you have none here yet. <a href="/first-steps" className="underline">Start a workspace</a>, then press Connect in your assistant again.
      </Message>
    );
  }
  const current = await currentWorkspaceId();
  const target = new URL(request.redirectUri);
  return (
    <ConsentForm
      request={JSON.stringify(Object.fromEntries(KEPT.filter((k) => params[k] !== undefined).map((k) => [k, params[k]])))}
      clientName={request.client.name}
      returnHost={target.host}
      onThisComputer={target.protocol === "http:"}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, canCreate: w.role !== "guest" }))}
      currentWorkspace={current}
      requested={request.scopes}
      endsOn={inDays(DEFAULT_CONNECTION_DAYS)}
      latest={inDays(365)}
    />
  );
}
