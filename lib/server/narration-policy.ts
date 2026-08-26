/**
 * Automatic narration is opt-in while we control TTS spend. Manual narration
 * requests remain available to admins regardless of this setting.
 */
export function isAutomaticNarrationOnPublishEnabled() {
    return process.env.AUTO_GENERATE_NARRATION_ON_PUBLISH?.trim().toLowerCase() === "true";
}
