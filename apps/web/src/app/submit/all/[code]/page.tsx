// The combined form (spec 0064; GLOSSARY: Combined Prompt, Token): the page a Combined Prompt's link opens without
// sign-in, with one field for each number of that message. The code in the address is the credential, kept by Ziffr only
// as a hash; no words from the address are ever shown. The core decides what the page gets: for each number what its own
// form link shows, and no note, no other Metric, no Token code and no link to one, so the page has none either.
import type { Metadata } from "next";
import { combinedForm, COMBINED_LINK_OVER } from "@ziffr/core/combined-form";
import { BrandBar } from "@/components/brand-bar";
import { LookScope } from "@/components/look-scope";
import { CombinedFields } from "./combined-fields";

export const metadata: Metadata = { title: "Your numbers", robots: { index: false, follow: false } };

/** The combined form, or the one page every link that opens nothing gets, whatever the reason. */
export default async function CombinedSubmitPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const form = await combinedForm(code);
  if (!form) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
        <h1 className="text-xl font-semibold">This link does not work</h1>
        <p className="mt-2 text-sm">{COMBINED_LINK_OVER}</p>
        <p className="mt-2 text-sm text-muted-foreground">To send a number now, use a newer message, or ask whoever asked you for it.</p>
      </div>
    );
  }
  const { look } = form;
  // The page is drawn in the Workspace's Theme: the look is all of it that came here, checked for contrast.
  return (
    <LookScope look={look} className="mx-auto max-w-md rounded-2xl p-2 sm:p-6">
      <div>
        <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
          <BrandBar look={look} plain className="mb-4" />
          <div className="text-xs text-muted-foreground">Hi {form.firstName}, please report</div>
          <h1 className="mt-1 text-xl font-semibold">Your numbers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Fill in the ones you know and leave the rest empty. You can open this page again later.</p>
          <CombinedFields code={code} rows={form.rows} numberStyle={form.numberStyle} notes={form.notes} />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">This link is for you; anyone who has it can send these numbers. It works for 30 days.</p>
        {look.footer && <p className="mt-2 text-center text-xs text-muted-foreground">{look.footer}</p>}
      </div>
    </LookScope>
  );
}
