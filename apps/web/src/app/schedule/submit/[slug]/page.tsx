// Opening a value due from the Schedule (spec 0027; GLOSSARY: Schedule, Token): signed in, you are taken to your own
// form link for the Metric. Links in the Schedule, the API and a calendar carry no secret; the form link's code is
// looked up here, for you only, and you go to the Metric's page when you have none. A period in the address (the form
// link's "Next", spec 0055) goes along, shaped as a day; the form link's page decides whether you may record it.
import { redirect } from "next/navigation";
import { ownFormCode } from "@ziffr/core/schedule";
import { currentActor } from "@/lib/viewer";

export default async function OpenValueDue({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ period?: string | string[] }> }) {
  const { slug } = await params;
  const { period } = await searchParams;
  const named = typeof period === "string" && /^\d{4}-\d{2}-\d{2}$/.test(period) ? `?period=${period}` : "";
  const code = await ownFormCode(await currentActor(), slug);
  redirect(code ? `/submit/${code}${named}` : /^[a-z0-9][a-z0-9-]{0,99}$/.test(slug) ? `/metrics/${slug}` : "/schedule");
}
