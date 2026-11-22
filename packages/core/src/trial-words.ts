// What people invited into a trial are told (spec 0040, ticket 5; GLOSSARY: Trial Workspace, Invitation): the same
// words in the invitation email, on the accept page and in the bar every Member sees, so they never say different things.

/** A day as "3 December" (UTC, as every trial day is written). */
export const trialDay = (endsAt: string): string => new Date(endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** What follows the end, in one sentence. */
export const TRIAL_AFTER = "After that it either becomes a subscription or is closed and its data is deleted.";

/** For an invitation (email and accept page): who invited, that it is a trial, until when, and what follows. */
export const trialInvitedWords = (inviter: string, endsAt: string): string => `${inviter} invited you to a trial of Ziffr that ends on ${trialDay(endsAt)}. ${TRIAL_AFTER}`;

/** For the bar a Member, Admin or Guest sees: the Owner's trial, its end, what follows. No counts: those are for Owners and Admins. */
export const trialMemberWords = (owner: string | null, endsAt: string): string => `You are in ${owner ? `${owner}'s` : "a"} trial of Ziffr, which ends on ${trialDay(endsAt)}. ${TRIAL_AFTER}`;

/** For a Member of a trial that has ended, under its heading "This trial has ended": what that means and who decides. */
export const trialEndedMemberWords = (owner: string | null): string => `Nothing is sent or taken any more. ${owner ?? "The Owner"} decides whether it goes on as a subscription; ask ${owner ? "them" : "the Owner"}.`;
