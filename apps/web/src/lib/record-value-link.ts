// The one address of Record a value for a value that is due (spec 0055; GLOSSARY: Schedule, Token), for the form
// link's "Next" button and the phone's home. It needs a sign-in and carries no secret: the person's own form link is
// looked up behind it, and the period counts only when they may record it.

/** Where the signed-in person records the value of a Metric's period (its first day, YYYY-MM-DD). */
export const recordValueHref = (slug: string, period: string): string => `/schedule/submit/${encodeURIComponent(slug)}?period=${encodeURIComponent(period)}`;
