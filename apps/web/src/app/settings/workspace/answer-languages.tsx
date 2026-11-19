"use client";
// The workspace's Answer Languages (spec 0022, ticket #118; GLOSSARY: Answer Language): the languages whose words
// ("last week", "letzte Woche") Ziffr understands in an answer. Until an Owner or Admin picks them they follow the
// Workspace Profile's country; the core checks the pick again on the server.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setAnswerLanguages } from "@/app/settings-actions";

/** "Answers are read in", with checkboxes for Owners and Admins; while nothing is chosen it says where they come from. */
export function AnswerLanguagesForm({ languages, options, chosen, country, canEdit }: { languages: string[]; options: { code: string; name: string }[]; chosen: boolean; country: string | null; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string[]>(languages);
  const nameOf = (c: string) => options.find((o) => o.code === c)?.name ?? c;
  const source = chosen ? null : country ? `English and the languages of the Workspace's country, ${country}, until an Owner or Admin picks them.` : "English, until an Owner or Admin picks languages or sets the Workspace's country.";
  const same = chosen && picked.length === languages.length && picked.every((c) => languages.includes(c));
  const save = () => start(async () => {
    try { unwrap(await setAnswerLanguages(picked)); toast.success("Saved"); } catch (err) { toast.error("Not saved", { description: shown(err) }); }
  });
  return (
    <section aria-labelledby="answer-languages-heading" className="space-y-3 border-t border-border pt-6">
      <div>
        <h2 id="answer-languages-heading" className="font-medium">Answer languages</h2>
        <p className="text-sm text-muted-foreground">The languages Ziffr understands in an answer, so that &ldquo;last week&rdquo; or &ldquo;letzte Woche&rdquo; names the period, not the value. Only these are tried, so words of different languages never mix.</p>
      </div>
      {canEdit ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <fieldset className="flex flex-wrap gap-x-5 gap-y-2" disabled={pending}>
            <legend className="sr-only">Answers are read in</legend>
            {options.map((o) => (
              <label key={o.code} className="inline-flex min-h-8 items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.includes(o.code)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.code] : p.filter((c) => c !== o.code)))} className="size-4" />
                {o.name}
              </label>
            ))}
          </fieldset>
          {/* Saving the shown languages while they only follow the country fixes them, so the button is on then too. */}
          <Button type="submit" variant="outline" disabled={pending || picked.length === 0 || same}>Save</Button>
          {picked.length === 0 && <p className="text-sm text-muted-foreground">Pick at least one language.</p>}
        </form>
      ) : (
        <p className="text-sm">Answers are read in {languages.map(nameOf).join(", ")}</p>
      )}
      {source && <p className="text-sm text-muted-foreground">{source}</p>}
    </section>
  );
}
