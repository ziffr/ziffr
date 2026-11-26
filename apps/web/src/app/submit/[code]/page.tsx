// The personal form link (GLOSSARY: Token, Stand-in, Submission Rule): a Submitter enters a Metric's value without
// signing in. The code in the address is the credential; no words from the address are ever shown (ticket 183). On a
// phone it is the short Record a value flow (spec 0055): the same page, narrowed by CSS.
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { submissionForm } from "@ziffr/core/page-data";
import { formTelegramLink } from "@ziffr/core/telegram-people";
import { formLinkExtras } from "@ziffr/core/form-link-extras";
import { formatValue, RULE_LABEL, SOURCE_LABEL } from "@ziffr/core/format";
import { SubmitForm } from "./submit-form";
import { TelegramConnect } from "./telegram-connect";
import { periodLabel } from "@ziffr/core/periods";
import { BrandBar } from "@/components/brand-bar";
import { LookScope } from "@/components/look-scope";
import { DEMO_VISIT_COOKIE, visitIdOf } from "@/lib/demo-visit-cookie";
import { recordValueHref } from "@/lib/record-value-link";
import { optionalActor } from "@/lib/viewer";

/** The signed-in person's extras for their own link, or null (signed out, someone else's link, or the read failed: the
 * form works without them). The core decides who gets what. */
async function ownExtras(code: string, period: unknown) {
  try {
    const actor = await optionalActor();
    return actor ? await formLinkExtras(actor, code, period) : null;
  } catch (e) {
    console.error("The form link's extras could not be read:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The personal form link's page. From its query string it takes only a period's first day, and only for the signed-in
 * person whose link it is, when they may record that period; the words shown for it are Ziffr's own. The result of a
 * submission comes back from the server action into the form (ticket 183), so no link can put its own words here. */
export default async function SubmitPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams?: Promise<{ period?: string | string[] }> }) {
  const { code } = await params;
  // The code is the credential; a stand-in's form works only while they are the stand-in (GLOSSARY: Stand-in).
  // A form of the demo Workspace opens only with a demo visit's cookie (spec 0051): a link a visitor made is no page for anyone else.
  const form = await submissionForm(code, visitIdOf((await cookies()).get(DEMO_VISIT_COOKIE)?.value) !== null);
  if (!form) notFound();
  // Telegram is offered only where the workspace turned it on (spec 0016).
  const telegram = await formTelegramLink(code);
  const extras = await ownExtras(code, (await searchParams)?.period);
  const { metric: m, person, period, current, look } = form;
  const named = extras?.named ?? null;
  const has = named ? named.has : current === null ? null : formatValue(m, current, form.numberStyle);
  // The page is drawn in the Workspace's Theme (ticket #542): the look is all of it that came here, checked for contrast.
  return (
    <LookScope look={look} className="mx-auto max-w-md rounded-2xl p-2 sm:p-6">
    <div>
      <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
        <BrandBar look={look} plain className="mb-4" />
        <div className="text-xs text-muted-foreground">Hi {person.name.split(" ")[0]}, please report</div>
        <h1 className="mt-1 text-xl font-semibold">{m.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
        <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          For <span className="font-medium">{named ? named.label : periodLabel(period, m.period, form.yearStart)}</span>
          {has !== null && <>, already has <span className="font-medium">{has}</span> ({RULE_LABEL[m.submission_rule].toLowerCase()})</>}
          {extras?.last && <p className="mt-1 sm:hidden">Last value <span className="font-medium">{extras.last.value}</span> for {extras.last.periodLabel}</p>}
        </div>
        {form.standingInFor && (
          <p role="note" className="mt-3 rounded-lg border px-3 py-2 text-sm">
            You answer in place of {form.standingInFor}. The value is recorded as theirs, marked as entered by you, and they are told and can replace it with their own.
          </p>
        )}
        {form.answeredOn != null && !named && (
          <p role="status" className="mt-3 rounded-lg border px-3 py-2 text-sm">
            Already answered{form.answeredOn in SOURCE_LABEL ? ` on ${SOURCE_LABEL[form.answeredOn as keyof typeof SOURCE_LABEL]}` : ""}. A new value here follows this Metric’s rule: {RULE_LABEL[m.submission_rule].toLowerCase()}.
          </p>
        )}
        <SubmitForm
          key={`${code} ${named?.start ?? ""}`}
          code={code}
          label={m.name}
          numberStyle={form.numberStyle}
          placeholder={m.unit || (m.format === "currency" ? "€" : m.format === "percent" ? "%" : "Value")}
          named={extras && named ? { metricId: extras.metricId, period: named.start } : null}
          next={extras?.next ? { href: recordValueHref(extras.next.slug, extras.next.period), name: extras.next.name, periodLabel: extras.next.periodLabel } : null}
          nothingDue={extras !== null && extras.next === null}
        />
      </div>
      {telegram?.telegramOn && <TelegramConnect code={code} linked={telegram.linked} help={telegram.help} />}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        This is your own link for {m.name}; anyone with it can submit. <Link href={`/metrics/${m.slug}`} className="underline max-sm:flex max-sm:min-h-11 max-sm:items-center max-sm:justify-center">Open metric</Link>
      </p>
      {look.footer && <p className="mt-2 text-center text-xs text-muted-foreground">{look.footer}</p>}
    </div>
    </LookScope>
  );
}
