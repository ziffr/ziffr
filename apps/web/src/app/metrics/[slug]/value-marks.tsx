// How a value in a Metric's history arrived (spec 0026; GLOSSARY: Import): "pasted by Ana" for a value from a paste,
// "imported" for an Import, by a Feed or a paste recorded as history.

/** The small marks under a value in the History tab; nothing for a value that is neither. */
export function ValueMarks({ pastedBy, imported }: { pastedBy: string | null; imported: boolean }) {
  return (
    <>
      {pastedBy && <span className="block text-xs text-muted-foreground">pasted by {pastedBy.split(" ")[0]}</span>}
      {imported && <span className="block text-xs text-muted-foreground" title="Recorded as history for a past period, without the Unusual Value check">imported</span>}
    </>
  );
}

/** Who typed a Filled-in Value (GLOSSARY: Filled-in Value, Guest; spec 0046), under the submitter. The name is the person's as the
 * page may show it (a Guest reads "Someone" for every name but their own); an imported value's sealed name is never shown to a Guest. */
export function EnteredBy({ by, importedName, guest }: { by: string | null | undefined; importedName?: string | null; guest: boolean }) {
  if (by) return <span className="block text-xs text-muted-foreground">entered by {by}</span>;
  if (importedName && !guest) return <span className="block text-xs text-muted-foreground">entered by {importedName} (imported)</span>;
  return null;
}
