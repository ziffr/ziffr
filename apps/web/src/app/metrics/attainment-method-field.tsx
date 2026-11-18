// A Metric's Attainment method in its forms (spec 0022, ticket #130; GLOSSARY: Attainment, Metric Description): its
// own method, or the Workspace's default. Named attainment_method; empty follows the Workspace, and the core stores
// only one of the two keys.
import { ATTAINMENT_METHODS, ATTAINMENT_METHOD_LABEL, ATTAINMENT_METHOD_RULE, type AttainmentMethod } from "@ziffr/core/attainment-method";

const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";

/** The "Attainment" select: the Workspace's default first, then each method with its rule. */
export function AttainmentMethodField({ value, workspaceMethod, id, className }: { value: AttainmentMethod | null; workspaceMethod: AttainmentMethod; id: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium">Attainment</label>
      <select id={id} name="attainment_method" defaultValue={value ?? ""} className={`mt-1 ${field}`}>
        <option value="">As the workspace: {ATTAINMENT_METHOD_LABEL[workspaceMethod].toLowerCase()}</option>
        {ATTAINMENT_METHODS.map((m) => <option key={m} value={m}>{ATTAINMENT_METHOD_LABEL[m]}: {ATTAINMENT_METHOD_RULE[m]}</option>)}
      </select>
      <p className="mt-1 text-xs text-muted-foreground">How the percentage of target is computed. They differ for “lower is better” and around zero.</p>
    </div>
  );
}
