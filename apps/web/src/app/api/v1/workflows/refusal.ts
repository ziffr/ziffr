// What the routes that change Workflows share (ticket #433): a refusal in Ziffr's words is 422.
import { WorkflowRefused } from "@ziffr/core/api-workflows";
import { errorBody, json } from "@/lib/api";

/** Runs a change; a refusal in words (a step that cannot be, who approves not being the key's to choose) answers 422 with them, anything else passes on. */
export async function refusedAs422(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof WorkflowRefused)) throw e;
    const { status, body } = errorBody("unprocessable", e.message);
    return json(body, status);
  }
}
