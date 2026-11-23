// @ts-nocheck
// Which Tokens count (GLOSSARY: Token, Stand-in). A stand-in's own Token counts only while that person is
// still the stand-in on the submitter's Token, and until it expires. Pure.

/** The parts of a Token that decide whether it counts. */
export type TokenRow = { metric_id: number; submitter_id: string; stand_in_id?: string | null; stands_in_for?: string | null; expires_at?: string | null };

/** Whether a Token counts today: always for a submitter's own; for a stand-in's, only while they still stand in and it has not expired. */
export function tokenValid(t: TokenRow, all: TokenRow[], today = new Date().toISOString().slice(0, 10)) {
  if (!t.stands_in_for) return true;
  if (t.expires_at && t.expires_at < today) return false;
  return all.some((x) => x.metric_id === t.metric_id && x.submitter_id === t.stands_in_for && !x.stands_in_for && x.stand_in_id === t.submitter_id);
}
