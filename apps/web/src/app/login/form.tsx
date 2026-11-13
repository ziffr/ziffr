"use client";
// The sign-in form: an email link always; the providers that are set up as buttons.
import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendSignInLink, signInWith } from "@/app/auth-actions";
import type { Provider } from "@/lib/sign-in";

export function LoginForm({ next, providers }: { next?: string; providers: { id: Provider; label: string }[] }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sent) return <p className="mt-8 text-sm">Check your inbox: we sent a sign-in link to <span className="font-medium">{email}</span>. It works once.</p>;
  return (
    <div className="mt-8 space-y-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => { try { await sendSignInLink(email, next); setSent(true); } catch (err) { setError((err as Error).message); } });
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Work email</span>
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <Button type="submit" className="w-full" disabled={pending}><Mail aria-hidden /> Send me a sign-in link</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      {providers.length > 0 && (
        <div className="space-y-2 border-t border-border pt-6">
          {providers.map((p) => (
            <Button key={p.id} variant="outline" className="w-full" disabled={pending} onClick={() => start(async () => { try { await signInWith(p.id, next); } catch (err) { setError((err as Error).message); } })}>
              Continue with {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
