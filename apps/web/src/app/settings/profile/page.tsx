// Your profile (spec 0006, ticket #94): your name and colour, the address you signed in with, and signing out.
import { currentActor } from "@/lib/viewer";
import { isDemo, signedIn } from "@/lib/auth";
import { myProfile, PERSON_COLORS } from "@ziffr/core/profile";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "./form";
import { myBusinessFunction } from "@ziffr/core/business-function";
import { BusinessFunctionForm } from "./business-function-form";
import { mySettableLimits } from "@ziffr/core/limits";
import { LimitsForm } from "@/components/limits-form";
import { setMySettableLimit } from "@/app/settings-actions";

export default async function ProfilePage() {
  const actor = await currentActor();
  const [me, demo] = await Promise.all([myProfile(actor), isDemo()]);
  // The proven address of the session, the one rule sign-in uses; the demo has no session and shows its made-up one.
  // Your own limits (ticket #518); the demo's visitors share one person, so it shows none.
  const limits = demo ? null : await mySettableLimits(actor);
  // Your own function only; a Guest has none to give and the demo holds none.
  const fn = demo || actor.role === "guest" ? undefined : await myBusinessFunction(actor);
  const email = demo ? me.email : ((await signedIn())?.verifiedEmail ?? null);
  return (
    <>
      <PageHeader title="Your profile" sub="How others see you in every workspace you belong to." />
      <ProfileForm name={me.name} color={me.color} colors={[...PERSON_COLORS]} email={email} demo={demo} />
      {fn !== undefined && <BusinessFunctionForm value={fn} />}
      {limits && <div className="mt-8 max-w-xl"><LimitsForm title="Your limits" intro="How much of this Workspace's messages and look-back you want. You can only go lower than what the Workspace allows. Empty follows the Workspace." limits={limits} canEdit save={setMySettableLimit} /></div>}
    </>
  );
}
