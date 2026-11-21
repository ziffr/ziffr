// Opening a value due from the Schedule (spec 0027; GLOSSARY: Schedule, Token): signed in, you are taken to your own
// form link for the Metric. Links in the Schedule, the API and a calendar carry no secret; the form link's code is
// looked up here, for you only, and you go to the Metric's page when you have none.
import { redirect } from "next/navigation";
import { ownFormCode } from "@ziffr/core/schedule";
import { currentActor } from "@/lib/viewer";

export default async function OpenValueDue({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const code = await ownFormCode(await currentActor(), slug);
  redirect(code ? `/submit/${code}` : /^[a-z0-9][a-z0-9-]{0,99}$/.test(slug) ? `/metrics/${slug}` : "/schedule");
}
