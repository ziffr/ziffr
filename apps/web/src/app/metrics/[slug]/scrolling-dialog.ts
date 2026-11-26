// Class strings of the Fill past periods dialogs (GLOSSARY: Metric): on a small screen the dialog stays inside it, its title and
// Close stay put, and the rest scrolls.

/** The dialog: never taller than the screen, its one column never wider than it. */
export const SCROLLING_DIALOG = "max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]";
/** The title: clear of the Close button, and a long Metric name wraps. */
export const SCROLLING_DIALOG_TITLE = "pr-10 leading-snug [overflow-wrap:anywhere]";
/** What scrolls; the padding keeps a focus ring from being cut off. */
export const SCROLLING_DIALOG_BODY = "-m-1 space-y-4 overflow-y-auto overscroll-contain p-1";
