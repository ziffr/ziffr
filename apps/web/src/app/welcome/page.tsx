import { redirect } from "next/navigation";
import { isDemo, personFor, sessionUser } from "@/lib/auth";
import { myWorkspaces } from "@/lib/viewer";
import { WelcomeForm } from "./form";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ another?: string }> }) {
  if (await isDemo()) redirect("/");
  const user = await sessionUser();
  if (!user) redirect("/login");
  // Someone who has a workspace comes here only to start another one.
  if ((await myWorkspaces(await personFor(user))).length && !(await searchParams).another) redirect("/");
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Start a workspace</h1>
      <p className="mt-2 text-sm text-muted-foreground">A workspace holds your team&rsquo;s metrics, dashboards and decks. You become its owner and can invite others. If a colleague already uses Ziffr, ask them to invite you instead.</p>
      <WelcomeForm />
    </div>
  );
}
