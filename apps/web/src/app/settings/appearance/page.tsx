// Your Appearance (#505; GLOSSARY: Appearance): light, dark, system or high contrast for Ziffr's own screens. Yours
// alone; Themes of dashboards and decks are a different thing and are not changed here.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { appearanceFor } from "@/lib/appearance";
import { PageHeader } from "@/components/page-header";
import { AppearanceForm } from "./form";

export default async function AppearancePage() {
  const demo = await isDemo();
  const current = await appearanceFor(await currentActor(), demo);
  return (
    <>
      <PageHeader title="Appearance" sub="How Ziffr's own screens look to you." />
      <AppearanceForm current={current} demo={demo} />
    </>
  );
}
