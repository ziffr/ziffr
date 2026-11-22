// What people invited into a trial are told (spec 0040, ticket 5; GLOSSARY: Trial Workspace, Invitation): the same
// words in the invitation email, on the accept page and in the bar every Member sees, so they never say different things.

/** A day as "3 December" (UTC, as every trial day is written). */
export const trialDay = (endsAt: string): string => new Date(endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** What follows the end, in one sentence. */
export const TRIAL_AFTER = "After that it either becomes a subscription or is closed and its data is deleted.";

/** For an invitation (email and accept page): who invited, that it is a trial, until when, and what follows. */
export const trialInvitedWords = (inviter: string | null, endsAt: string): string => `${inviter ? `${inviter} invited` : "You are invited"}${inviter ? " you" : ""} to a trial of Ziffr that ends on ${trialDay(endsAt)}. ${TRIAL_AFTER}`;

/** For the bar a Member, Admin or Guest sees: the Owner's trial, its end, what follows. No counts: those are for Owners and Admins. */
export const trialMemberWords = (owner: string | null, endsAt: string): string => `You are in ${owner ? `${owner}'s` : "a"} trial of Ziffr, which ends on ${trialDay(endsAt)}. ${TRIAL_AFTER}`;

/** For a Member of a trial that has ended, under its heading "This trial has ended": what that means and who decides. */
export const trialEndedMemberWords = (owner: string | null): string => `Nothing is sent or taken any more. ${owner ?? "The Owner"} decides whether it goes on as a subscription; ask ${owner ? "them" : "the Owner"}.`;

/** The two ways on after a trial, and the day its data goes: the same words in every reminder. `deletedAt` is the day it is
 * deleted. Subscribing keeps everything, colleagues included; the Workspace Export is the Workspace in one file for a
 * Ziffr you run yourself (there is no free Size on hosted Ziffr). */
export const trialEndsWords = (endsAt: string, deletedAt: string): string =>
  `Your trial ends on ${trialDay(endsAt)}. Then it closes, and on ${trialDay(deletedAt)} it is deleted with everything in it. `
  + "There are two ways on. Subscribe to a Size under Change Size in the Workspace settings, and everything stays as it is, colleagues included. "
  + "Or download the Workspace Export from the link below and run Ziffr yourself: it holds your Metrics, values, dashboards, decks and Workflows.";

/** What the Owner is told when a Size is cancelled: the Workspace is closed like an ended trial and goes on the day named. */
export const workspaceClosedWords = (deletedAt: string): string =>
  `Your Size was cancelled, so this Workspace is closed: nothing is sent or taken any more, and its keys and links have stopped. On ${trialDay(deletedAt)} it is deleted with everything in it. `
  + "To keep your numbers, download the Workspace Export from the link below and run Ziffr yourself: it holds your Metrics, values, dashboards, decks and Workflows.";

/** What a person who is not the Owner is told when the Workspace they belong to is closing and it is their only one: the
 * day it goes, and that their account goes with it. `owner` is null for a role that does not see who else is there. */
export const membersGoingWords = (owner: string | null, deletedAt: string): string =>
  `The Ziffr Workspace you belong to${owner ? `, ${owner}'s,` : ""} is closing, and nothing can be added to it any more. On ${trialDay(deletedAt)} it is deleted with everything in it, and your account with it, since it is the only Workspace you belong to. `
  + `Ask ${owner ? "them" : "whoever invited you"} whether it goes on.`;

/** What the Owner is told when a cancelled Workspace is opened again. */
export const workspaceReopenedWords = "Your Workspace is open again, as it was before it closed. What stopped when it closed stays stopped: make new keys, and connect Slack and Telegram again. Questions and tasks that were open stay closed.";
