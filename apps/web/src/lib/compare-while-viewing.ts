// GLOSSARY: Widget, Comparison, Demo Mode. Who is offered a Widget's Comparisons without entering Edit mode.

/** `mayChange` is the dashboard screen's own check (owner or Editor, in the grid). A demo that visitors may not change
 * (`demo` without a visit of their own) offers nothing while viewing. The core checks the change either way. */
export function comparesWhileViewing(mayChange: boolean, demo: boolean, demoVisit: boolean): boolean {
  return mayChange && (!demo || demoVisit);
}
