// What adding or removing a Submitter does (GLOSSARY: Submitter, Contact, Stand-in, Prompt), as the sentences a person
// reads before they confirm under Who submits. Pure, so the dialogs and their tests use the same words.

/** What the words about adding someone depend on. */
export type Adding = {
  name: string;
  /** A Contact has no sign-in: their form link is all they get. */
  contact: boolean;
  /** Whether the Metric takes values by Web form, and the names of the ways it takes them. */
  webForm: boolean;
  ways: string[];
};

/** What the person added will see and get. */
export function addingWords({ name, contact, webForm, ways }: Adding): string[] {
  const sees = contact
    ? `${name} does not sign in.${webForm ? " Their form link shows this Metric’s name and description and the current value, and takes theirs." : ""}`
    : `${name} will see this Metric, with its values and history, and can send in its values.`;
  const gets = webForm
    ? "Ziffr makes them a personal form link for this Metric."
    : `This Metric takes no values by Web form: they send them by ${ways.join(" or ") || "no way yet"}.`;
  return [sees, gets];
}

/** What asking now, or not, means. `workflow` says whether a Workflow asks for the Metric's values. */
export function askNowWords({ askNow, workflow, contact }: { askNow: boolean; workflow: boolean; contact: boolean }): string {
  if (askNow) return "It goes by a way that reaches them. If none does, it waits in the Outbox. Someone asked for this Metric in the last day gets no new request.";
  const later = workflow ? "They are asked when its Workflow next asks or reminds." : "This Metric has no Workflow, so Ziffr will not ask them by itself.";
  return `Nothing is sent now${contact ? ", so their form link does not reach them yet" : ""}. ${later}`;
}

/** What the words about removing someone depend on. */
export type Removing = {
  name: string;
  contact: boolean;
  /** Whether they own the Metric, and so go on seeing it. */
  owner: boolean;
  /** Whether the person removing them is an Editor, who adds only people who see the Metric. */
  editor: boolean;
  /** Who stands in for them on this Metric, if anyone. */
  standIn: string | null;
  /** Whom they stand in for on this Metric. */
  standsFor: string[];
  /** The other people who submit it, and whether a Feed does. */
  otherPeople: number;
  feed: boolean;
};

/** What removing the person does, in one paragraph. */
export function removingWords({ name, contact, owner, editor, standIn, standsFor, otherPeople, feed }: Removing): string {
  return [
    "Their own form link for this Metric stops working, and requests not yet sent to it are not sent. The values they sent stay.",
    standIn ? `${standIn} no longer stands in for them here.` : "",
    standsFor.length ? `${name} stays the Stand-in for ${standsFor.join(" and ")} and can still be asked in their place.` : "",
    contact || owner ? "" : "Unless it is shared with them or reaches them another way, they no longer see this Metric.",
    editor && !owner ? "If they no longer see it, only the owner can add them again." : "",
    otherPeople ? "" : feed ? "No person is asked for this Metric after this. A Feed still sends its values." : "Nobody else submits it, so nobody is asked for its values after this.",
  ].filter(Boolean).join(" ");
}
