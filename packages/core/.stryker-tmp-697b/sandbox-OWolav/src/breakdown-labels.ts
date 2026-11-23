// @ts-nocheck
// Breakdown labels (GLOSSARY: Breakdown, Workspace Key; spec 0028 step 1, ticket #335): a history entry's label opened.
// Recording a Breakdown (sealing each label for its row, with its blind index beside it, and adding to a row of the same
// label) is done in record-value.ts. Security: a label that does not open reads as missing, never as its ciphertext.
import { isSealed, type WorkspaceCipher } from "./workspace-keys";

/** A history entry's label opened. A copy of a row's label is sealed for the row it was copied from (`row_id`); an
 * older entry, or one the re-encryption job sealed for itself, for its own id. A plain one reads as it is only while its
 * column is not finished. */
export function openHistoryLabel(cipher: WorkspaceCipher, entry: { row_id: number | string | null; label: string; id?: number | string }): string | null {
  // A plain label is judged by the history's own column (once the job has finished it, plain values are refused); a
  // sealed one opens for the row it was copied from, or for its own id.
  if (!isSealed(entry.label)) return cipher.open({ table: "breakdown_history", column: "label", row: entry.id ?? 0 }, entry.label);
  if (entry.row_id !== null && entry.row_id !== undefined) return cipher.open({ table: "breakdown_rows", column: "label", row: entry.row_id }, entry.label);
  return entry.id === undefined ? null : cipher.open({ table: "breakdown_history", column: "label", row: entry.id }, entry.label);
}
