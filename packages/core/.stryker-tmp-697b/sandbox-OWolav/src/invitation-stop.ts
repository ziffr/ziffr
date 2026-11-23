// @ts-nocheck
// "Do not invite me again" (spec 0040, ticket 5; GLOSSARY: Invitation). Every invitation email carries a one-click link
// (RFC 8058) that stops invitation emails to that address from every Workspace on the Installation, so Ziffr is no way
// to mail a stranger twice. The link works with no sign-in: its token is signed for the address's canonical form
// (mailboxKey, as the daily limits count it) and this one use (unsubscribe-token.ts). The stop is a row only the service
// role reads. It stops the email only: an Owner may still send the link themselves, as for any invitation the limits held back.
import { db } from "./db";
import { unsubscribeSigner } from "./unsubscribe-token";

const signer = // Any address an invitation may go to (not only ASCII), so none fails to get its stop link; no control characters, no spaces.
unsubscribeSigner("ziffr/invitation-stop/v1", /^[^\s\u0000-\u001f\u007f-\u009f\u2028\u2029]{3,254}$/u, 254 * 4);

/** The token for the stop link of an address (its mailboxKey), or null when this Installation has no key to sign with. */
export const signInvitationStopToken = signer.sign;

/** Whether the token is one Ziffr signed (for the page that asks first). Reveals nothing else, not even the address. */
export const invitationStopTokenValid = (token: string): boolean => signer.verify(token) !== null;

/** Stops invitation emails to the address the token names, with no sign-in. False for any other token; using it twice
 * changes nothing. The same answer for every address, so the link tells nothing about who was invited. */
export async function stopInvitationsByToken(token: string): Promise<boolean> {
  const addressKey = signer.verify(token);
  if (!addressKey) return false;
  const { error } = await db().from("invitation_stops").upsert({ address_key: addressKey }, { onConflict: "address_key", ignoreDuplicates: true });
  return !error;
}
