// Runs one newcomer scenario against the MCP server with a real model (ticket #614; GLOSSARY: Access Key, Metric,
// Trial Workspace): a fresh Trial Workspace with a person and an Access Key as a connected assistant gets, the server
// in-process (as the app serves it, through @ziffr/sdk to the running app), the model's tool calls answered by the
// server, a scripted person who answers its questions, and Ziffr's state read afterwards.
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAccessKey } from "@ziffr/core/access-keys";
import { ASSISTANT_SCOPES } from "@ziffr/core/actor";
import { db } from "@ziffr/core/db";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { Ziffr } from "@ziffr/sdk";
import { createServer } from "../src/server.js";
import { fallbackReply, type Scenario } from "./scenarios";
import { readMetrics, type Check } from "./state";

/** The model the evals run on unless ZIFFR_EVAL_MODEL says otherwise. */
export const DEFAULT_MODEL = "claude-haiku-5-5";
/** How many answers the scripted person gives after the first request. */
const REPLIES_MAX = 3;
/** Most model calls in one turn, so a looping assistant ends the scenario instead of the budget. */
const CALLS_PER_TURN_MAX = 15;

/** How one scenario went. */
export type Outcome = { id: string; checks: Check[]; questions: number; toolCalls: number; toolErrors: string[]; turns: number; lastWords: string; note: string; tokens: number };

const textOf = (content: Anthropic.ContentBlock[]) => content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();

/** A trial Workspace with the person, their teammates and the key an assistant connection would hold. */
async function setup(sc: Scenario) {
  const w = await workspace("Eval trial");
  await w.trial(new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  const personId = await w.person("owner");
  await db().from("profiles").update({ name: sc.language === "de" ? "Sabine Eval" : "Sam Eval" }).eq("id", personId);
  const teammateIds: string[] = [];
  for (const name of sc.teammates ?? []) {
    const id = await w.person("member");
    await db().from("profiles").update({ name }).eq("id", id);
    teammateIds.push(id);
  }
  const { secret } = await createAccessKey(w.actor(personId, "owner"), { name: "Eval assistant", scopes: ASSISTANT_SCOPES, expiresOn: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10) });
  return { w, personId, teammateIds, secret };
}

/** Plays `sc` against the app at `url` with `model`; the Workspace is deleted afterwards whatever happens. */
export async function runScenario(sc: Scenario, o: { url: string; model: string; anthropic: Anthropic }): Promise<Outcome> {
  const { w, personId, teammateIds, secret } = await setup(sc);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(new Ziffr({ url: o.url, accessKey: secret, maxRetries: 0 })).connect(a);
  const mcp = new Client({ name: "ziffr-eval", version: "1" });
  await mcp.connect(b);
  const out: Outcome = { id: sc.id, checks: [], questions: 0, toolCalls: 0, toolErrors: [], turns: 0, lastWords: "", note: "", tokens: 0 };
  try {
    const tools = (await mcp.listTools()).tools.map((t): Anthropic.Tool => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema }));
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: sc.opening }];
    for (let reply = 0; ; reply++) {
      out.turns++;
      let words = "";
      for (let call = 0; ; call++) {
        const res = await o.anthropic.messages.create({ model: o.model, max_tokens: 8000, system: mcp.getInstructions(), tools, messages });
        out.tokens += res.usage.input_tokens + res.usage.output_tokens;
        messages.push({ role: "assistant", content: res.content });
        words = textOf(res.content);
        if (res.stop_reason !== "tool_use") { if (res.stop_reason !== "end_turn") out.note = `stopped: ${res.stop_reason}`; break; }
        if (call >= CALLS_PER_TURN_MAX) { out.note = "too many tool calls in one turn"; break; }
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const use of res.content) {
          if (use.type !== "tool_use") continue;
          out.toolCalls++;
          const r = await mcp.callTool({ name: use.name, arguments: use.input as Record<string, unknown> });
          const text = (r.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("\n");
          if (r.isError) out.toolErrors.push(`${use.name}: ${text.slice(0, 300)}`);
          results.push({ type: "tool_result", tool_use_id: use.id, content: text, is_error: Boolean(r.isError) });
        }
        messages.push({ role: "user", content: results });
      }
      out.lastWords = words;
      const asked = words.includes("?");
      if (asked) out.questions++;
      if (!asked || reply >= REPLIES_MAX || out.note) break;
      messages.push({ role: "user", content: sc.replies[reply] ?? fallbackReply(sc.language) });
    }
    out.checks = sc.checks({ personId, teammateIds, metrics: await readMetrics(w.id), toolErrors: out.toolErrors, lastWords: out.lastWords });
  } catch (e) {
    out.note = `crashed: ${(e as Error).message}`;
    out.checks = [{ name: "the scenario ran", ok: false, detail: out.note }];
  } finally {
    await mcp.close();
    await w.cleanup();
  }
  return out;
}
