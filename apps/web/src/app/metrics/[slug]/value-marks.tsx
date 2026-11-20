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
