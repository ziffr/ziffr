"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorkspace } from "@/app/auth-actions";

/** Names and creates a person's first workspace. */
export function WelcomeForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="mt-8 space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { try { await createWorkspace(name); } catch (err) { setError((err as Error).message); } }); }}>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name of your team or company</span>
        <Input required value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <Button type="submit" className="w-full" disabled={pending}>Create workspace</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
