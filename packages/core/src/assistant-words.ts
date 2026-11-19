// Texts aimed at assistants (spec 0030, GLOSSARY: Pack, MCP Server): words in a file from outside that address an AI
// assistant, such as instructions to ignore what it was told, to call a tool, or to send or record something.
// Security: a filter for what is obvious, not a protection. Assistants reach Ziffr only through their key's scopes
// (threat model, accepted risk "Assistants read workspace text"); a hit only makes a person look before installing.

// Words that are an attack on whoever reads them as instructions, whoever they address.
const ALWAYS: RegExp[] = [
  /\b(?:ignore|disregard|forget|override|bypass)\b[^.!?]{0,60}\b(?:instructions?|prompts?|guidelines|guardrails)\b/i,
  /\b(?:ignore|disregard|forget)\s+(?:all|everything|anything)\b[^.!?]{0,20}\b(?:above|before|previous|prior|earlier|said)\b/i,
  /\bsystem\s+(?:prompt|message|instructions?)\b/i,
  /\b(?:developer|hidden)\s+(?:message|instructions?|mode)\b/i,
  /\bjail\s*break/i,
  /\bprompt\s+injection\b/i,
  // A tool's name as assistants see them, such as submit_value or delete_metric.
  /\b(?:list|get|submit|create|delete|update|set|add|remove|record|send)_[a-z_]+\b/i,
  /\b(?:call|invoke|execute|trigger)\s+(?:the\s+|a\s+|any\s+|this\s+)?(?:[a-z]+\s+)?(?:tools?|functions?|mcp)\b/i,
  // Words about "the user", as an assistant is told of the person it works for.
  /\b(?:tell|inform|remind|convince|ask)\s+the\s+(?:user|human)\b/i,
  /\b(?:do\s+not|don't|never)\s+(?:tell|mention|show|reveal)\b[^.!?]{0,30}\b(?:user|human)\b/i,
];
// Words that address an assistant as such ("Assistant:", "if you are an AI", "act as"): a Metric about AI spend or a
// sales agent does not, so they count only with an order (ORDER).
const ADDRESS = new RegExp([
  "\\b(?:assistants?|ai|llms?|language\\s+models?|chat\\s?bots?|claude|chatgpt|gpt|gemini|copilot)\\b\\s*(?:[,:]|must\\b|should\\b|shall\\b|will\\b|needs?\\s+to\\b|has\\s+to\\b|please\\b)",
  "\\byou\\s+are\\s+(?:now\\s+)?(?:an?\\s+)?(?:ai|assistant|language\\s+model|llm|bot)\\b",
  "\\bif\\s+you\\s+are\\s+(?:an?\\s+)?(?:ai|assistant|language\\s+model|llm|bot|agent)\\b",
  "\\b(?:act|behave)\\s+as\\b",
  "\\bpretend\\s+(?:to\\s+be|you)\\b",
  "\\b(?:dear|hey|hello|hi|attention)\\s+(?:ai|assistant|claude|chatgpt|gpt|model|llm|bot)\\b",
].join("|"), "i");
const ORDER = /\b(?:call|invoke|run|execute|send|e-?mail|forward|post|upload|record|submit|write|delete|remove|change|update|create|share|reveal|print|output|repeat|ignore|tell|say|reply|answer)\b/i;

/** Whether a text addresses an assistant with an instruction, by the words above. */
export function aimsAtAssistant(text: string): boolean {
  return ALWAYS.some((r) => r.test(text)) || (ADDRESS.test(text) && ORDER.test(text));
}

/** Every text in a value read from JSON that aims at an assistant, by its path (`contents.metrics[0].metric.description`). */
export function textsAimedAtAssistants(value: unknown, path = ""): { path: string; text: string }[] {
  if (typeof value === "string") return aimsAtAssistant(value) ? [{ path, text: value }] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => textsAimedAtAssistants(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => textsAimedAtAssistants(v, path ? `${path}.${k}` : k));
  return [];
}
