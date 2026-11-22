"use client";
// The sign-in form: an email link always; the providers that are set up as buttons.
import { useCallback, useState, useTransition } from "react";
import { Turnstile } from "@/components/turnstile";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendSignInLink, signInWith } from "@/app/auth-actions";
import type { Provider } from "@/lib/sign-in";

export function LoginForm({ next, providers, turnstileSiteKey = null, agreement }: { next?: string; agreement?: React.ReactNode; providers: { id: Provider; label: string }[]; turnstileSiteKey?: string | null }) {
  const [email, setEmail] = useState("");
  const [check, setCheck] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const onAnswer = useCallback((a: string | null) => setCheck(a), []);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The check-your-email state replaces the form; it names the address, and the way back is a button, not a reload.
  if (sent) return (
    <div role="status" className="space-y-3 text-sm">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted"><Mail aria-hidden className="size-5" /></span>
      <h2 className="text-[length:var(--text-lg)] font-medium">Check your email</h2>
      <p className="text-muted-foreground">We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>. It works once. If it does not arrive, look in your spam folder.</p>
      <Button type="button" variant="outline" size="sm" onClick={() => { setSent(false); setCheck(null); setRound((r) => r + 1); }}>Use another address</Button>
    </div>
  );
  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          // An answer works once: after a refusal the check is drawn again for the next try.
          start(async () => {
            const result = await sendSignInLink(email, next, check ?? undefined).catch(() => ({ error: "The link could not be sent. Try again." }));
            if (!result) return setSent(true);
            // A check answer counts once: a new one for the next try.
            setError(result.error); setCheck(null); setRound((r) => r + 1);
          });
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Work email</span>
          <Input type="email" name="email" autoComplete="email" spellCheck={false} placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onAnswer={onAnswer} resetKey={round} />}
        <Button type="submit" size="lg" className="w-full" disabled={pending || Boolean(turnstileSiteKey && !check)}><Mail aria-hidden /> Send me a sign-in link</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      {providers.length > 0 && (
        <div className="space-y-2">
          <p aria-hidden className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">or</p>
          {providers.map((p) => (
            <Button key={p.id} variant="outline" className="w-full" disabled={pending || Boolean(turnstileSiteKey && !check)} onClick={() => start(async () => { const result = await signInWith(p.id, next, check ?? undefined); if (result) { setError(result.error); setCheck(null); setRound((r) => r + 1); } })}>
              Continue with {p.label}
            </Button>
          ))}
        </div>
      )}
      {/* Server-drawn words, given by the page: "By signing up you agree to the Terms…" where an account can be made (#760). */}
      {agreement}
    </div>
  );
}
