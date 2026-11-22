"use client";
// The file picker of New Workspace > From a Workspace Export: sends the file as the body of one request, then follows
// the job on its progress page.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UNEXPECTED } from "@/lib/action-error";

/** Picks a Workspace Export file and starts its import. */
export function ImportForm() {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const f = file.current?.files?.[0];
    if (!f) return setError("Choose the file first.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace-import", { method: "POST", headers: { "x-ziffr-import": "1", "content-type": "application/octet-stream" }, body: f });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (res.ok && body?.id) return router.push(`/welcome/import/${body.id}`);
      setError(body?.error ?? UNEXPECTED);
    } catch {
      setError(UNEXPECTED);
    }
    setBusy(false);
  }
  return (
    <form className="space-y-3" onSubmit={send}>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Workspace Export file</span>
        <input ref={file} type="file" required accept=".jsonl,.gz,.jsonl.gz,application/gzip,application/x-ndjson,text/plain" className="block w-full text-sm" />
      </label>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending the file" : "Import"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
