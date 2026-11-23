// The Audit Log's words for a Filled-in Value (GLOSSARY: Filled-in Value, Audit Log, Away; spec 0046): for whom it was
// entered, which period, in which role, and who set the Away that opened it. The Audit Log answers "who put that number
// in", so the person it was entered for is named, never the value (the Audit Log holds no values). Names come from the
// page's own list of the Workspace's members, which only Owners and Admins read here.

const ROLE_WORDS: Record<string, string> = { stand_in: "the Stand-in", workflow_owner: "the Workflow's owner", metric_owner: "the Metric's owner" };

/** "for Sara, 2026-10-01, as the Metric's owner, while Away (set by Ada)": a person no longer known reads "a former member". */
export function filledInDetail(d: Record<string, unknown>, nameOf: (id: string) => string | undefined): string {
  const name = (id: unknown) => (typeof id === "string" && id ? (nameOf(id) ?? "a former member") : null);
  const forWhom = name(d.for);
  const awayBy = name(d.away_set_by);
  const parts = [forWhom ? `for ${forWhom}` : null, String(d.period ?? "") || null, `as ${ROLE_WORDS[String(d.as)] ?? ROLE_WORDS.metric_owner}`];
  if (awayBy) parts.push(d.away_set_by === d.for ? "while Away" : `while Away (set by ${awayBy})`);
  return parts.filter(Boolean).join(", ");
}
