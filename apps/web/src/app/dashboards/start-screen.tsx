"use client";
// The start screen of Home (#1292; GLOSSARY: Home dashboard, Test Metric, Setup Guide): "Where would you like to
// start?", shown while a person has nothing but an untouched example, or nothing at all. The core decides which choices
// the person may use; this screen only draws them.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Coffee, ListChecks, Package, Plus } from "lucide-react";
import { tryExample } from "@/app/home-actions";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import type { StartChoices } from "@ziffr/core/trial-example";

const CHOICE = "stock flex min-h-11 w-full items-start gap-3 rounded-[var(--radius-card)] p-4 text-left no-underline transition-[transform,box-shadow] hover:-translate-y-px disabled:opacity-60";

function Words({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <>
      <span aria-hidden className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{children}</span>
      </span>
      <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
    </>
  );
}

/** The choices, one below the other. */
export function StartScreen({ choices }: { choices: StartChoices }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const example = () => start(async () => {
    setError(null);
    try {
      const r = await tryExample();
      if (isActionError(r)) { setError(r.error); return; }
      router.push(`/dashboards/${r.dashboardId}`);
    } catch { setError(UNEXPECTED); }
  });
  return (
    <div className="mx-auto max-w-xl py-4 md:py-10">
      <h1 className="text-xl font-semibold">Where would you like to start?</h1>
      <ul className="mt-5 space-y-3">
        <li>
          <Link href="/metrics/new" className={CHOICE}>
            <Words icon={<Plus />} title="Create your first figure">Name what you want to keep track of, and Ziffr asks for it over time.</Words>
          </Link>
        </li>
        {choices.pack && (
          <li>
            <Link href="/settings/packs" className={CHOICE}>
              <Words icon={<Package />} title="Install a Pack">Ready-made Metrics, Dashboards and Workflows for your kind of work.</Words>
            </Link>
          </li>
        )}
        {choices.example && (
          <li>
            <button type="button" className={CHOICE} disabled={pending} onClick={example}>
              <Words icon={<Coffee />} title="Try the example">Ziffr asks you once a day how many cups of coffee you drank, so you see how it works.</Words>
            </button>
          </li>
        )}
        {choices.setup && (
          <li>
            {/* A plain link: it may lead to First Steps, which draws its own frame, so the page is loaded anew. */}
            <a href={choices.setup} className={CHOICE}>
              <Words icon={<ListChecks />} title="Continue setting up">Carry on where you left off.</Words>
            </a>
          </li>
        )}
      </ul>
      {choices.askColleague && <p className="mt-4 text-sm text-muted-foreground">Or ask a colleague to share a dashboard with you.</p>}
      <p role="alert" className="mt-2 min-h-5 text-sm text-destructive">{error}</p>
    </div>
  );
}
