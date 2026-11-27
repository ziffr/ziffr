// The old address for starting a Workspace (GLOSSARY: Workspace, First Steps): it leads to First Steps (spec 0067),
// which checks who is asking. `?another=1`, for someone who starts one more Workspace, is kept.
import { redirect } from "next/navigation";
import { FIRST_STEPS_PATH } from "@ziffr/core/first-steps-screens";

/** Leads to First Steps. */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ another?: string }> }) {
  redirect((await searchParams).another ? `${FIRST_STEPS_PATH}?another=1` : FIRST_STEPS_PATH);
}
