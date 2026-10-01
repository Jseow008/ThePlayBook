import { describe, it, expect } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { withLunaFinalPhase } from '../../lib/server/luna-final-phase';
const message = (id: string, phase: string | null, text: string) => ({ type: 'message', id, role: 'assistant', status: 'completed', phase, content: [{ type: 'output_text', text, annotations: [], logprobs: [] }] });
async function run(output: ReturnType<typeof message>[], adapted = true, incomplete = false) {
    const model = createOpenAI({ apiKey: 'offline', fetch: async () => new Response(JSON.stringify({
        id: 'resp_fixture', object: 'response', created_at: 1, model: 'gpt-6-luna', status: incomplete ? 'incomplete' : 'completed', error: null, incomplete_details: incomplete ? { reason: 'max_output_tokens' } : null,
        output, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    }), { headers: { 'content-type': 'application/json' } }) })('gpt-6-luna');
    return generateText({ model: adapted ? withLunaFinalPhase(model) : model, prompt: 'synthetic',
        output: Output.object({ schema: z.object({ ids: z.array(z.string()) }) }), maxRetries: 0 });
}
describe('experimental Luna phase boundary through real SDK without network', () => {
    it('reproduces commentary concatenation then accepts only the explicit final message', async () => {
        const messages = [message('m1', 'commentary', 'Checking.'), message('m2', 'final_answer', '{"ids":["a"]}')];
        await expect(run(messages, false)).rejects.toThrow();
        const result = await run(messages);
        expect(result.output).toEqual({ ids: ['a'] });
        expect(result.usage.outputTokens).toBe(5);
    });
    it('does not repair malformed final JSON', async () => {
        await expect(run([message('m1', 'commentary', 'Checking.'), message('m2', 'final_answer', '{broken')])).rejects.toThrow();
    });
    it('rejects multiple final messages instead of choosing the favorable one', async () => {
        await expect(run([message('m1', 'final_answer', '{"ids":[]}'), message('m2', 'final_answer', '{"ids":["a"]}')])).rejects.toThrow('AMBIGUOUS');
    });
    it('rejects commentary without final output', async () => {
        await expect(run([message('m1', 'commentary', '{"ids":[]}')])).rejects.toThrow('AMBIGUOUS');
    });
    it('rejects commentary after final output', async () => {
        await expect(run([message('m1', 'final_answer', '{"ids":[]}'), message('m2', 'commentary', 'More.')])).rejects.toThrow('PHASE_ORDER');
    });
    it('rejects an incomplete provider response even when its text parses', async () => {
        await expect(run([message('m1', 'final_answer', '{"ids":[]}')], true, true)).rejects.toThrow('INCOMPLETE_PROVIDER');
    });
    it('preserves untagged single-message schema validation', async () => {
        expect((await run([message('m1', null, '{"ids":[]}')])).output).toEqual({ ids: [] });
        await expect(run([message('m1', null, '{"bad":1}')])).rejects.toThrow();
    });
});
