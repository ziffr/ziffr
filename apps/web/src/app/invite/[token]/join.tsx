"use client";
// Accepting an Invitation (GLOSSARY: Invitation).
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/app/auth-actions";
import { isActionError, UNEXPECTED } from "@/lib/action-error";

/** Joins the workspace the invitation is for. Success is a redirect, which arrives in the `catch` as a thrown signal:
 * it goes on to Next.js first, or the general error would show until the next page opens. */
export function JoinButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button type="button" className="w-full" disabled={pending} onClick={() => start(async () => { try { const r = await acceptInvite(token); if (isActionError(r)) setError(r.error); } catch (e) { unstable_rethrow(e); setError(UNEXPECTED); } })}>Join</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
