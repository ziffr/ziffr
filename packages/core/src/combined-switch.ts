// The switch of the Combined Prompt (spec 0064; GLOSSARY: Combined Prompt). Off until the replies to such a message are
// read (ticket 5), so that no message is sent which Ziffr cannot answer. It is a constant in the code: no person,
// setting, environment variable or request can turn it on. Tests replace this module (`vi.mock`).

/** Whether runs may combine the Prompts of one person into one message. */
export const combinedPromptsOn = (): boolean => false;
