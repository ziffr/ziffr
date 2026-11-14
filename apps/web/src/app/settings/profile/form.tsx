"use client";
// Your name and colour, your email and signing out (spec 0006, ticket #94). The core checks the name and colour again.
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateMyProfile } from "@/app/settings-actions";
import { signOut } from "@/app/auth-actions";
import { cn } from "@/lib/utils";

/** The form for your own profile; in the demo it only shows. */
export function ProfileForm({ name, color, colors, email, demo }: { name: string; color: string; colors: string[]; email: string | null; demo: boolean }) {
  const [pending, start] = useTransition();
  const [n, setN] = useState(name);
  const [c, setC] = useState(color);
  const changed = n.trim() !== name || c !== color;
  const save = () => start(async () => {
    try { await updateMyProfile({ name: n, color: c }); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: (err as Error).message }); }
  });
  return (
    <div className="max-w-xl space-y-8">
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="block text-sm font-medium">
          Name
          <Input value={n} onChange={(e) => setN(e.target.value)} maxLength={80} disabled={demo || pending} className="mt-1" autoComplete="name" />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Colour</legend>
          <p className="text-sm text-muted-foreground">Shown with your initial where people are picked, such as in share dialogs.</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
            {colors.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={c === k}
                aria-label={`Colour ${k}`}
                disabled={demo || pending}
                onClick={() => setC(k)}
                className={cn("flex size-10 items-center justify-center rounded-full text-sm font-medium text-white ring-offset-2 ring-offset-background focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-70", c === k && "ring-2 ring-foreground")}
                style={{ background: k }}
              >
                {c === k ? <Check aria-hidden className="size-4" /> : (n.trim()[0] ?? "?")}
              </button>
            ))}
          </div>
        </fieldset>
        {demo ? (
          <p className="text-sm text-muted-foreground">The demo&apos;s people keep their names and colours.</p>
        ) : (
          <Button type="submit" disabled={pending || !changed || !n.trim()}>Save</Button>
        )}
      </form>

      <section aria-labelledby="email-heading" className="space-y-1 border-t border-border pt-6">
        <h2 id="email-heading" className="font-medium">Email</h2>
        {email ? <p className="text-sm">{email}</p> : <p className="text-sm text-muted-foreground">No proven address: you signed in a way that does not prove one.</p>}
        <p className="text-sm text-muted-foreground">{demo ? "A made-up address: the demo sends no email." : "The address you signed in with. It cannot be changed here."}</p>
      </section>

      <section aria-labelledby="out-heading" className="space-y-2 border-t border-border pt-6">
        <h2 id="out-heading" className="font-medium">{demo ? "Leave the demo" : "Sign out"}</h2>
        {demo ? (
          <Link href="/demo/leave" prefetch={false} className="inline-flex min-h-9 items-center text-sm underline">Leave the demo</Link>
        ) : (
          <Button type="button" variant="outline" disabled={pending} onClick={() => start(() => signOut())}><LogOut aria-hidden /> Sign out</Button>
        )}
      </section>
    </div>
  );
}
