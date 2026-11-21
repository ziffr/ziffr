// Access Keys in the workspace settings (spec 0006, ticket #96; GLOSSARY: Access Key, Access Log), moved from the
// Team page: a person's own keys, and for Owners and Admins every key of the workspace and who has a Calendar Link.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { getProfiles } from "@/lib/data";
import { listAccessKeys } from "@ziffr/core/access-keys";
import { accessLog } from "@ziffr/core/access-log";
import { PageHeader } from "@/components/page-header";
import { AccessKeys } from "./keys";
import { listCalendarLinks } from "@ziffr/core/calendar-links";
import { CalendarLinks } from "./calendar-links";

export default async function KeysPage() {
  const actor = await currentActor();
  // The demo has no Access Keys: a key there would act as a made-up person for anyone.
  if (await isDemo()) {
    return (
      <>
        <PageHeader title="Access Keys" />
        <p className="text-sm text-muted-foreground">The demo has no Access Keys: a key there would act as a made-up person for anyone.</p>
      </>
    );
  }
  const admin = actor.role === "owner" || actor.role === "admin";
  // Who has a Calendar Link, for Owners and Admins only (spec 0027).
  const [keys, people, calendarLinks] = await Promise.all([listAccessKeys(actor), getProfiles(), admin ? listCalendarLinks(actor) : Promise.resolve(null)]);
  // Each key's recent calls, for the same people who see the key (its creator, Owners and Admins): the Access Log.
  const logs = Object.fromEntries(await Promise.all(keys.map(async (k) => [k.id, await accessLog(actor, k.id, 20)] as const)));
  return (
    <>
      <PageHeader title="Access Keys" />
      <AccessKeys keys={keys} logs={logs} people={Object.fromEntries(people.map((p) => [p.id, p.name]))} viewer={actor.personId} isOwner={actor.role === "owner"} canCreate={actor.role !== "guest"} canReadUsage={actor.role === "owner" || actor.role === "admin"} />
      {calendarLinks && <CalendarLinks links={calendarLinks} />}
    </>
  );
}
