// Your profile (spec 0006, ticket #94): your name and colour, the address you signed in with, and signing out.
import { currentActor } from "@/lib/viewer";
import { isDemo, signedIn } from "@/lib/auth";
import { myProfile, PERSON_COLORS } from "@ziffr/core/profile";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "./form";
import { LayoutSwitch } from "@/components/layout-switch";
import { layoutChoice } from "@/lib/layout-choice";

export default async function ProfilePage() {
  const actor = await currentActor();
  const [me, demo] = await Promise.all([myProfile(actor), isDemo()]);
  // The proven address of the session, the one rule sign-in uses; the demo has no session and shows its made-up one.
  const email = demo ? me.email : ((await signedIn())?.verifiedEmail ?? null);
  return (
    <>
      <PageHeader title="Your profile" sub="How others see you in every workspace you belong to." />
      <ProfileForm name={me.name} color={me.color} colors={[...PERSON_COLORS]} email={email} demo={demo} />
      <div className="mt-8"><LayoutSwitch initial={(await layoutChoice()) === "sidebar"} /></div>
    </>
  );
}
