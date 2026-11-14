/** Interactive chats use one qualified model; legacy provider overrides do not escalate it. */
export const INTERACTIVE_AI_MODEL = "gpt-6-luna";
export const INTERACTIVE_AI_PROVIDER_OPTIONS = {
    openai: { reasoningEffort: "none", forceReasoning: true, store: false },
} as const;
