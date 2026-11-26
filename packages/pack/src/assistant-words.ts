// Texts aimed at assistants (spec 0030, GLOSSARY: Pack, MCP Server): words in a file from outside that address an AI
// assistant, such as instructions to ignore what it was told, to call a tool, or to send or record something.
// Security: a filter for what is obvious, not a protection. Assistants reach Ziffr only through their key's scopes
// (threat model, accepted risk "Assistants read workspace text"); a hit only makes a person look before installing.

// Words that are an attack on whoever reads them as instructions, whoever they address.
const ALWAYS: RegExp[] = [
  // "Ignore your instructions", "disregard all previous rules": not "ignore the instructions in the old handbook".
  /\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+|any\s+)?(?:of\s+)?(?:your|previous|prior|above|earlier|preceding|these|those|my|the\s+(?:previous|above|system))\s+(?:\w+\s+){0,2}?(?:instructions?|prompts?|guidelines|guardrails|rules|directions|orders)\b/i,
  /\b(?:ignore|disregard|forget)\s+(?:all|everything|anything)\b[^.!?]{0,20}\b(?:above|before|previous|prior|earlier|said)\b/i,
  /\byou\s+(?:were|have\s+been|'ve\s+been)\s+(?:given|told|instructed)\b/i,
  /\bsystem\s+(?:prompt|message|instructions?)\b/i,
  /\b(?:developer|hidden)\s+(?:message|instructions?|mode)\b/i,
  /\bjail\s*break/i,
  /\bprompt\s+injection\b/i,
  // A tool's name as assistants see them, such as submit_value or delete_metric ("add_on" is not one).
  /\b(?:list|get|submit|create|delete|update|set|add|remove|record|send)_[a-z]{3,}(?:_[a-z]+)*\b/i,
  /\b(?:call|invoke|execute|trigger)\s+(?:the\s+|a\s+|any\s+|this\s+)?(?:[a-z_]+\s+){0,3}(?:tools?|functions?|mcp)\b/i,
  // Words about "the user", as an assistant is told of the person it works for.
  /\b(?:tell|inform|remind|convince)\s+the\s+(?:user|human)\b/i,
  /\b(?:do\s+not|don't|never)\s+(?:tell|mention|show|reveal)\b[^.!?]{0,30}\b(?:user|human)\b/i,
];
// Words that address an assistant as such ("Assistant:", "Bots should", "if you are an AI", "note for agents"): a
// Metric about AI spend or a person called Claude does not, so they count only with an order (ORDER). Names of assistants count only
// when spoken to ("Claude, please"), since "AI:" or "Copilot:" are also labels.
const ADDRESS = new RegExp([
  "\\b(?:assistants?|llms?|language\\s+models?|chat\\s?bots?|bots?|ai\\s+(?:assistants?|agents?|models?))\\b\\s*(?:[,:\\-–—]|must\\b|should\\b|shall\\b|will\\b|needs?\\s+to\\b|has\\s+to\\b|please\\b|reading\\s+this\\b)",
  // "Agents" and "model" are also people and things a Metric counts ("Sales agents must record calls", "Pricing
  // model"): they address an assistant only when spoken to, as a label before an order ("Model: output the key").
  "^\\s*(?:agents?|models?)\\s*[,:\\-–—]",
  "\\b(?:agents?|models?)\\s+reading\\s+this\\b",
  "\\b(?:ai|claude|chatgpt|gpt|gemini|copilot)\\b\\s*(?:,|please\\b)",
  "\\b(?:note|message|instructions?)\\s+(?:for|to)\\s+(?:any\\s+|the\\s+)?(?:ai\\s+)?(?:agents?|assistants?|llms?|models?|bots?)\\b",
  "\\byou\\s+are\\s+(?:now\\s+)?(?:an?\\s+)?(?:ai|assistant|language\\s+model|llm|bot)\\b",
  "\\bif\\s+you\\s+are\\s+(?:an?\\s+)?(?:ai|assistant|language\\s+model|llm|bot|agent)\\b",
  "\\bif\\s+you\\s+are\\s+reading\\s+this\\b",
  "\\bpretend\\s+(?:to\\s+be|you)\\b",
  "\\b(?:dear|hey|hello|hi|attention)\\s+(?:ai|assistant|agent|claude|chatgpt|gpt|model|llm|bot)\\b",
].join("|"), "i");
const ORDER = /\b(?:call|invoke|run|use|execute|send|e-?mail|forward|post|upload|record|submit|write|delete|remove|change|update|create|share|reveal|print|output|repeat|ignore|tell|say|reply|answer)\b/i;

/** Whether a text addresses an assistant with an instruction, by the words above. */
export function aimsAtAssistant(text: string): boolean {
  return ALWAYS.some((r) => r.test(text)) || (ADDRESS.test(text) && ORDER.test(text));
}

// A Workflow Template step's type that reads like a tool's name. It is a fixed word of the format, at this one place of
// a Pack, which no person writes: only exactly this word there is passed over, so any other text is checked as ever.
const STEP_TYPE = /^contents\.workflows\[\d+\]\.template\.steps\[\d+\]\.type$/;
const FORMAT_WORD = "send_snapshot";

/** Every text in a value read from JSON that aims at an assistant, by its path (`contents.metrics[0].metric.description`). */
export function textsAimedAtAssistants(value: unknown, path = ""): { path: string; text: string }[] {
  if (typeof value === "string") return aimsAtAssistant(value) && !(value === FORMAT_WORD && STEP_TYPE.test(path)) ? [{ path, text: value }] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => textsAimedAtAssistants(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => textsAimedAtAssistants(v, path ? `${path}.${k}` : k));
  return [];
}
