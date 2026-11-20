// The address of a Period Record (GLOSSARY: Period Record): one Metric's page for one period. Pure, so pages, client
// components and other lists (such as a Workflow's timeline) all link to it the same way.

/** The page of a Metric's value for one period, `period` being the period's first day as YYYY-MM-DD. */
export function periodRecordUrl(slug: string, period: string): string {
  return `/metrics/${encodeURIComponent(slug)}/${encodeURIComponent(period)}`;
}
