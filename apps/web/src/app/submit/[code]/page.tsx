// The personal form link (GLOSSARY: Token, Stand-in, Submission Rule): a Submitter enters a Metric's value without
// signing in. The code in the address is the credential; nothing else from the address is ever shown (ticket 183).
import { notFound } from "next/navigation";
import Link from "next/link";
import { submissionForm } from "@ziffr/core/page-data";
import { formTelegramLink } from "@ziffr/core/telegram-people";
import { formatValue, RULE_LABEL } from "@ziffr/core/format";
import { SubmitForm } from "./submit-form";
import { TelegramConnect } from "./telegram-connect";
import { periodLabel } from "@ziffr/core/periods";

/** The personal form link's page. It reads nothing from its query string: the result of a submission comes back from
 * the server action into the form (ticket 183), so no link can put its own words on this page. */
export default async function SubmitPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // The code is the credential; a stand-in's form works only while they are the stand-in (GLOSSARY: Stand-in).
  const form = await submissionForm(code);
  if (!form) notFound();
  // Telegram is offered only where the workspace turned it on (spec 0016).
  const telegram = await formTelegramLink(code);
  const { metric: m, person, period, current } = form;
  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="text-xs text-muted-foreground">Hi {person.name.split(" ")[0]}, please report</div>
        <h1 className="mt-1 text-xl font-semibold">{m.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
        <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          For <span className="font-medium">{periodLabel(period, m.period, form.yearStart)}</span>
          {current !== null && <>, already has <span className="font-medium">{formatValue(m, current, form.numberStyle)}</span> ({RULE_LABEL[m.submission_rule].toLowerCase()})</>}
        </div>
        <SubmitForm code={code} numberStyle={form.numberStyle} placeholder={m.unit || (m.format === "currency" ? "€" : m.format === "percent" ? "%" : "Value")} />
      </div>
      {telegram?.telegramOn && <TelegramConnect code={code} linked={telegram.linked} />}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        This link is {person.name.split(" ")[0]}’s Token for {m.name}. <Link href={`/metrics/${m.slug}`} className="underline">Open metric</Link>
      </p>
    </div>
  );
}
