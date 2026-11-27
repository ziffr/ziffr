// What both forms opened without sign-in say to a Stand-in (GLOSSARY: Stand-in, Filled-in Value): whose value this
// records. `name` is what the core decided the reader may be told.

/** The note above a field where a Stand-in answers in someone's place. */
export function StandInNote({ name }: { name: string }) {
  return (
    <p role="note" className="mt-3 rounded-lg border px-3 py-2 text-sm">
      You answer in place of {name}. The value is recorded as theirs, marked as entered by you, and they are told and can replace it with their own.
    </p>
  );
}
