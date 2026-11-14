"use client";
// Accepting an Invitation (GLOSSARY: Invitation).
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/app/auth-actions";

/** Joins the workspace the invitation is for. */
export function JoinButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-6 space-y-2">
      <Button type="button" className="w-full" disabled={pending} onClick={() => start(async () => { try { await acceptInvite(token); } catch (e) { setError((e as Error).message); } })}>Join</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
