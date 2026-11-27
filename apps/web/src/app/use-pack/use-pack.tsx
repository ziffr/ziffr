"use client";
// The guided set-up of one Pack with the server behind it (spec 0068; GLOSSARY: Pack): the screens of `PackFlow`, with
// the actions that check the answers and set them up.
import { useMemo } from "react";
import { checkPackStart, takePackStartStep } from "./actions";
import { PackFlow, type PackFlowActions, type PackFlowData } from "./flow";
import { packRefOf } from "./paths";
import { inviteActions } from "./task";

/** The flow for the Pack of one address. */
export function UsePack({ segment, data, keep }: { segment: string; data: PackFlowData; keep: string }) {
  const actions = useMemo((): PackFlowActions => {
    // The page found the address good before it drew this.
    const ref = packRefOf(segment)!;
    return { check: (choices) => checkPackStart(ref, choices), takeStep: (choices, run) => takePackStartStep(ref, choices, run), invites: inviteActions };
  }, [segment]);
  return <PackFlow key={keep} data={data} actions={actions} keep={keep} />;
}
