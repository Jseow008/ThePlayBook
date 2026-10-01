/** Preserve explicit final-answer boundaries before structured-output validation. */
import { wrapLanguageModel } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';

export function withLunaFinalPhase(model: LanguageModelV3): LanguageModelV3 {
    return wrapLanguageModel({ model, middleware: {
        specificationVersion: 'v3',
        wrapGenerate: async ({ doGenerate }) => {
            const result = await doGenerate();
            if (result.finishReason.unified !== 'stop') throw new Error('SELECTOR_INCOMPLETE_PROVIDER_RESPONSE');
            const texts = result.content.filter(part => part.type === 'text');
            const phased = texts.some(part => part.providerMetadata?.openai?.phase != null);
            if (!phased) return result; // Legacy single-output parsing still uses the original schema validator.
            const finals = texts.filter(part => part.providerMetadata?.openai?.phase === 'final_answer');
            const finalIds = new Set(finals.map(part => part.providerMetadata?.openai?.itemId));
            if (!finals.length || finalIds.size !== 1 || ![...finalIds].every(id => typeof id === 'string' && id.length > 0)
                || texts.some(part => !['commentary', 'final_answer'].includes(String(part.providerMetadata?.openai?.phase)))) {
                throw new Error('SELECTOR_AMBIGUOUS_RESPONSE_PHASE');
            }
            let reachedFinal = false;
            for (const part of texts) {
                if (part.providerMetadata?.openai?.phase === 'final_answer') reachedFinal = true;
                else if (reachedFinal) throw new Error('SELECTOR_INVALID_RESPONSE_PHASE_ORDER');
            }
            // Keep usage and provider response intact. Remove only explicitly identified commentary,
            // never arbitrary leading text, extra JSON, or an invalid final assessment.
            return { ...result, content: result.content.filter(part => part.type !== 'text' || part.providerMetadata?.openai?.phase === 'final_answer') };
        },
    } });
}
