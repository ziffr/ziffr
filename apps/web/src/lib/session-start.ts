// When this browser session was signed in (spec 0040): the latest authentication time in the access token's claims,
// which the sign-in service signs and a token refresh does not move. Fails closed: null when there is no session, the
// claims cannot be read or they carry no time, so the caller counts the session as too old.
import { authClient } from "@/lib/auth";

/** The start of the current session, or null when it cannot be told. */
export async function sessionStartedAt(): Promise<Date | null> {
  try {
    const { data } = await (await authClient()).auth.getClaims();
    const amr = (data?.claims as { amr?: { timestamp?: unknown }[] } | undefined)?.amr;
    const stamps = (Array.isArray(amr) ? amr : []).map((a) => a?.timestamp).filter((t): t is number => typeof t === "number" && Number.isFinite(t));
    return stamps.length ? new Date(Math.max(...stamps) * 1000) : null;
  } catch {
    return null;
  }
}
