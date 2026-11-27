"use client";
import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorkspace } from "@/app/auth-actions";
import { UNEXPECTED } from "@/lib/action-error";

/** Names and creates a person's first workspace. Success is a redirect, which arrives in the `catch` as a thrown signal:
 * it goes on to Next.js first, or the general error would show until the next page opens. */
export function WelcomeForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { try { const r = await createWorkspace(name); if (r?.error) setError(r.error); } catch (err) { unstable_rethrow(err); setError(UNEXPECTED); } }); }}>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name of the workspace</span>
        <Input required name="workspace" autoComplete="organization" placeholder="Your name, your team or your company" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <Button type="submit" className="w-full" disabled={pending}>Create workspace</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
