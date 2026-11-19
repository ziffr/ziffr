"use client";
// A plain form submit that shows its server action's refusal (tickets 192, 282). A production build hides the message
// of an error a server action throws, so the action answers `{ error }` (lib/action-result.ts) and this shows those
// words next to the form or button. Only the action's own answer is shown, never text from the URL.
import { useActionState, type ReactNode } from "react";
import type { ActionError } from "@/lib/action-error";
import { Button } from "@/components/ui/button";

/** A form action as useActionState runs it: what it answered last time, then the form. */
export type AnsweredAction = (previous: ActionError | void | null, form: FormData) => Promise<ActionError | void>;

/** The refusal's words, read out as they appear. */
function Refusal({ state }: { state: ActionError | void | null }) {
  return state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null;
}

/** A form whose action may refuse; the refusal shows below its fields. */
export function AnsweredForm({ action, className, children }: { action: AnsweredAction; className?: string; children: ReactNode }) {
  const [state, act] = useActionState(action, null);
  return (
    <div>
      <form action={act} className={className}>{children}</form>
      <Refusal state={state} />
    </div>
  );
}

/** A submit button with an action of its own inside a larger form; its refusal shows beside it. */
export function AnsweredButton({ action, children, variant }: { action: AnsweredAction; children: ReactNode; variant?: "outline" | "default" }) {
  const [state, act, pending] = useActionState(action, null);
  return (
    <>
      <Refusal state={state} />
      <Button formAction={act} variant={variant} type="submit" disabled={pending}>{children}</Button>
    </>
  );
}
