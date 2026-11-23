// @ts-nocheck
// An Approval's question (GLOSSARY: Approval) as people read it in the web. The stored question ends with the words a
// chat message needs ("Reply approve, or send back: ..."); the web has buttons instead, so it shows the question without them.

const CHAT_INSTRUCTIONS = /\s*Reply “approve”, or “send back:” with what to check\.\s*$/;

/** The question of an Approval without the chat instructions; any other question comes back unchanged. */
export function approvalQuestionForWeb(question: string): string {
  return question.replace(CHAT_INSTRUCTIONS, "");
}
