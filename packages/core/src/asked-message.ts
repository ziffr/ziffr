// What a new Metric's first requests did (GLOSSARY: Prompt, Submitter, Outbox), as one sentence that says only what
// happened. Pure, so the page and the tests use the same words; the facts come from the Deliveries the core made.

/** One person asked for a value: by which way, and whether it left Ziffr, waits to, or stays in the Outbox. */
export type FirstAsk = { personId: string; name: string; connector: string; label: string; state: "sent" | "queued" | "outbox" | "failed" };

const WAY = (a: FirstAsk) => (a.connector === "email" ? "by email" : `through ${a.label}`);
const names = (list: FirstAsk[]) => list.map((a) => a.name).join(", ");

/** The sentence under a created Metric. With no Submitters it says so; otherwise it names who got a form link and
 * how, who is still waiting for the mail job, and who was not reached because that way sends nothing here. */
export function firstAsksMessage(input: { submitters: number; asked: FirstAsk[] }): string {
  if (!input.submitters) return "Nobody submits it yet: add Submitters under Who submits on its Description tab.";
  if (!input.asked.length) return "Nobody was asked: its Submitters are programs, which send values themselves.";
  const parts: string[] = [];
  for (const way of [...new Set(input.asked.filter((a) => a.state === "sent").map(WAY))]) {
    const who = input.asked.filter((a) => a.state === "sent" && WAY(a) === way);
    parts.push(`${names(who)} got a form link and a first request ${way}.`);
  }
  const queued = input.asked.filter((a) => a.state === "queued");
  if (queued.length) parts.push(`${names(queued)} will get a form link and a first request shortly.`);
  for (const a of input.asked.filter((x) => x.state === "outbox")) {
    parts.push(a.connector === "email" ? `Email is not set up on this Ziffr, so nothing was sent to ${a.name}: the request waits in the Outbox.` : `${a.label} does not send for real here, so the request to ${a.name} waits in the Outbox.`);
  }
  const failed = input.asked.filter((a) => a.state === "failed");
  if (failed.length) parts.push(`The request to ${names(failed)} could not be delivered.`);
  return parts.join(" ");
}
