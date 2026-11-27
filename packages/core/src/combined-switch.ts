// The switch of the Combined Prompt (spec 0064; GLOSSARY: Combined Prompt). On since replies to such a message are read
// (prompt-reply.ts). It is a constant in the code: no person, setting, environment variable or request can change it.
// Tests replace this module (`vi.mock`).

/** Whether runs may combine the Prompts of one person into one message. */
export const combinedPromptsOn = (): boolean => true;
