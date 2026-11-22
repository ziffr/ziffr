"use client";
// Workflow Templates (spec 0030, GLOSSARY: Workflow Template): saving a Workflow as one, without its people, and
// starting a Workflow from one with its Approvers picked. The core checks every person again.
import { templateStepLabel } from "./template-step-label";
import type { WorkflowTemplateSummary } from "@ziffr/core/workflow-templates";
import type { Workflow } from "@ziffr/core/types";
import { createWorkflowFromTemplate, saveAsWorkflowTemplate } from "@/app/deck-workflow-template-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { shown, unwrap } from "@/lib/action-error";
import { LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";

/** How many Approvers a template asks for. */
const approversWanted = (t: WorkflowTemplateSummary) => t.body.steps.reduce((n, s) => (s.type === "approve" ? n + s.approvers : n), 0);

/** "Save as Workflow Template…": the Workflow's Due Date and steps, its Approvers left open. */
export function SaveWorkflowTemplate({ workflow, mine }: { workflow: Workflow; mine: WorkflowTemplateSummary[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState("");
  const [replaceId, setReplaceId] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = () => start(async () => {
    try {
      unwrap(await saveAsWorkflowTemplate({ workflowId: workflow.id, name, description, replaceId }));
      toast.success(replaceId ? "Workflow Template replaced" : "Workflow Template saved", { description: "Find it under New from a template, here on Workflows." });
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error("Workflow Template not saved", { description: shown(e) });
    }
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><LayoutTemplate aria-hidden /> Save as template…</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Save as Workflow Template</DialogTitle>
          <DialogDescription>Everyone on the team can start a Workflow from it. It keeps the Due Date and the steps, with the words of its checklist items; the Approvers and the people a checklist item goes to are picked again each time it is used. Checklist items kept to a Group stay behind. Only you can change it.</DialogDescription>
          <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); save(); }}>
            {mine.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Save as</span>
                <select value={replaceId ?? ""} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; setReplaceId(id); const t = mine.find((x) => x.id === id); if (t) { setName(t.name); setDescription(t.description); } }} className={field}>
                  <option value="">A new Workflow Template</option>
                  {mine.map((t) => <option key={t.id} value={t.id}>Replace “{t.name}” (keeps its versions)</option>)}
                </select>
              </label>
            )}
            <label className="block"><span className="mb-1 block text-xs font-medium">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium">What it is for</span><Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="One line, shown when someone uses it" /></label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || !name.trim()}>{replaceId ? "Replace Workflow Template" : "Save Workflow Template"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "New from a template": a Workflow Template, a name, and the Approvers it asks for, picked from the members. */
export function NewWorkflowFromTemplate({ templates, people }: { templates: WorkflowTemplateSummary[]; people: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [approvers, setApprovers] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = templates.find((x) => x.id === picked) ?? null;
  const wanted = t ? approversWanted(t) : 0;
  const ready = !!t && approvers.length === wanted && approvers.every(Boolean) && new Set(approvers).size === wanted;
  const make = () => start(async () => {
    try {
      const id = unwrap(await createWorkflowFromTemplate(t!.id, name, approvers));
      setOpen(false);
      router.push(`/workflows?id=${id}`);
    } catch (e) {
      toast.error("Not done", { description: shown(e) });
    }
  });
  return (
    <>
      <Button variant="ghost" className="w-full justify-start" onClick={() => setOpen(true)}><LayoutTemplate aria-hidden /> New from a template</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>New Workflow from a template</DialogTitle>
          <DialogDescription>The Workflow is yours: change its steps as you like. The template stays as it is.</DialogDescription>
          <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); if (ready) make(); }}>
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Template</span>
              <select value={picked ?? ""} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; setPicked(id); const next = templates.find((x) => x.id === id); setApprovers(next ? Array(approversWanted(next)).fill("") : []); }} className={field}>
                <option value="">Choose a Workflow Template</option>
                {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            {t && (
              <>
                {t.description && <p className="text-muted-foreground">{t.description}</p>}
                <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {t.body.steps.map((s, i) => <li key={i}>{templateStepLabel(s)}</li>)}
                </ol>
                <label className="block"><span className="mb-1 block text-xs font-medium">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t.name} /></label>
                {approvers.map((a, i) => (
                  <label key={i} className="block">
                    <span className="mb-1 block text-xs font-medium">Approver {wanted > 1 ? i + 1 : ""}</span>
                    <select value={a} onChange={(e) => setApprovers(approvers.map((x, j) => (j === i ? e.target.value : x)))} className={field}>
                      <option value="">Choose a person</option>
                      {people.map((p) => <option key={p.id} value={p.id} disabled={approvers.includes(p.id) && a !== p.id}>{p.name}</option>)}
                    </select>
                  </label>
                ))}
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!ready || pending}>Create Workflow</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
