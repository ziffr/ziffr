// A server action's refusal shown as a toast (ticket 192), for a click that has nothing else on screen to say it in.
// Client code only; the words come from the action's `{ error }` (lib/action-error.ts), never from a thrown message.
import { toast } from "sonner";
import { isActionError, type ActionError } from "./action-error";

/** Shows the refusal in an action's answer, if it is one, and says whether it was. */
export function told(r: unknown, title = "Not done"): r is ActionError {
  if (!isActionError(r)) return false;
  toast.error(title, { description: r.error });
  return true;
}
