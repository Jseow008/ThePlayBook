/** Frozen settings for historical response replay, never current-model qualification. */
export const RECORDED_LUNA_LOW_MODEL_CONFIG = Object.freeze({
    version: "personal-evidence-selector-model-v3",
    promptVersion: "personal-evidence-selector-v4",
    provider: "openai",
    model: "gpt-6-luna",
    maxOutputTokens: 1600,
    maxRetries: 0,
    temperature: "provider default",
    reasoningEffort: "low",
    forceReasoning: true,
    store: false,
    responseAdapter: "explicit-final-phase-v1",
} as const);
