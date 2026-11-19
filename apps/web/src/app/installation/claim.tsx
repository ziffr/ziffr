"use client";
// Claiming the Installation (spec 0025, ticket #196; GLOSSARY: Installation Admin): the setup code from the server
// log, typed or pasted. The core checks it; this only sends it.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { claimInstallation } from "@/app/installation-actions";

/** The form that makes the signed-in person the first Installation Admin with the setup code. */
export function ClaimForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section aria-labelledby="claim-heading" className="max-w-xl space-y-4">
      <h2 id="claim-heading" className="font-medium">Enter the setup code</h2>
      <p className="text-sm text-muted-foreground">
        Ziffr wrote a setup code to its server log when it started, and again when this page opened if none was waiting.
        With Docker, run <code className="font-mono text-xs">docker compose logs app</code> and look for &ldquo;setup code&rdquo;.
        It works once.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await claimInstallation(code);
            if ("error" in r) { setError(r.error); return; }
            toast.success("You run this Installation now.");
            router.refresh();
          });
        }}
      >
        <label className="min-w-0 flex-1 text-xs text-muted-foreground">Setup code
          <Input value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} maxLength={40} autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX" className="mt-1 font-mono" aria-invalid={error ? true : undefined} aria-describedby={error ? "claim-error" : undefined} />
        </label>
        <Button type="submit" disabled={pending || code.trim().length < 16}>Claim</Button>
      </form>
      {error && <p id="claim-error" role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
