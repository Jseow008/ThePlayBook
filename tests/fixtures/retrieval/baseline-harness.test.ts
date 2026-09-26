import { expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import corpus from './corpus-v1.json';

const state = vi.hoisted(() => ({
  selected: [] as string[], account: 'account-a', system: '', tables: [] as string[], rpcCalls: [] as string[],
  generationCalled: false, records: [] as Array<Record<string, unknown>>,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: state.account } }, error: null }) },
  from: (table: string) => {
    state.tables.push(table);
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      in: (key: string, value: unknown) => { filters[key] = value; return query; },
      order: () => query,
      then: (resolve: (value: unknown) => unknown) => {
        const rows = state.records.filter((row) => row.state === 'available' && row.accountId === state.account);
        const filtered = rows.filter((row) => !Array.isArray(filters.id) || filters.id.includes(row.id));
        const data = table === 'user_library' ? [] : filtered.filter((row) => table === 'segment' ? row.type === 'source_segment' : table === 'user_highlights' ? row.type === 'highlight' : row.type === 'reflection')
          .filter((row) => !filters.user_id || row.accountId === filters.user_id)
          .map((row) => ({ id: row.id, highlighted_text: row.text, note_body: row.note, markdown_body: row.text, created_at: row.createdAt, content_item: { title: row.title }, segment: { title: 'Fixture section' } }));
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return query;
  },
  rpc: async (name: string) => {
    state.rpcCalls.push(name);
    return { data: state.records.filter((row) => row.type === 'source_segment' && row.state === 'available' && row.accountId === state.account && state.selected.includes(String(row.id)))
      .map((row) => ({ segment_id: row.id, content_item_id: row.contentId, similarity: 0.9 })), error: null };
  },
}) }));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: async () => ({ success: true }), rateLimitFailureResponseWithTelemetry: vi.fn() }));
vi.mock('@/lib/server/security-telemetry', () => ({ recordAiRouteAbuse: vi.fn() }));
vi.mock('@/lib/server/ai-usage-quota', () => ({ checkAiUsageQuota: async () => ({ allowed: true, windows: [] }), recordGeneratedAiMessage: vi.fn(), getQuotaExceededMessage: vi.fn() }));
vi.mock('@/lib/server/analytics', () => ({ captureServerAnalyticsEvent: vi.fn() }));
vi.mock('ai', () => ({ smoothStream: vi.fn(), streamText: (options: { system: string }) => {
  state.system = options.system; state.generationCalled = true;
  return { toTextStreamResponse: () => new Response('structural-provider-stub'), toUIMessageStreamResponse: () => new Response('structural-provider-stub') };
} }));
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: () => 'structural-provider-stub' }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { embedContent: async () => ({ embeddings: [{ values: Array(768).fill(0.1) }] }) }; } }));

import { POST as notesPost } from '@/app/api/chat/notes/route';
import { POST as libraryPost } from '@/app/api/chat/route';

it.skipIf(process.env.PERSONAL_RETRIEVAL_BASELINE !== '1')('executes frozen current routes and records structural capability evidence without claiming model quality', async () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  expect(head.startsWith(corpus.baselineCommit)).toBe(true);
  const baselinePaths = ['app/api/chat/route.ts', 'app/api/chat/notes/route.ts', 'lib/server/notes-chat-context.ts'];
  for (const path of baselinePaths) {
    expect(readFileSync(path, 'utf8')).toBe(execFileSync('git', ['show', `${head}:${path}`], { encoding: 'utf8' }));
  }
  vi.stubEnv('ANTHROPIC_API_KEY', 'structural-only-not-a-secret');
  vi.stubEnv('GEMINI_API_KEY', 'structural-only-not-a-secret');
  vi.stubEnv('AI_PROVIDER', 'anthropic');
  vi.stubEnv('OPENAI_API_KEY', '');
  state.records = corpus.evidence;
  const results = [];
  for (const fixture of corpus.cases) {
    state.system = ''; state.tables = []; state.rpcCalls = []; state.generationCalled = false;
    state.selected = fixture.requiredIds;
    const useLibrary = fixture.class === 'source_segment';
    const selectedIds = fixture.baselineClientSelection === 'beyond_first_page' ? fixture.distractorIds : [...fixture.requiredIds, ...fixture.distractorIds];
    const highlightIds = selectedIds.filter((id) => corpus.evidence.some((e) => e.id === id && e.type === 'highlight'));
    // The pre-change Notes UI can send only loaded highlight IDs. Passing the
    // future typed scope also demonstrates that old routes cannot honor it.
    const response = await (useLibrary ? libraryPost : notesPost)(new NextRequest('http://localhost/api/chat' + (useLibrary ? '' : '/notes'), {
      method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: fixture.query }], highlightIds, scope: fixture.scope }),
    }));
    expect(response.status).toBe(200);
    const presentIds = corpus.evidence.filter((row) => state.system.includes(row.text)).map((row) => row.id);
    results.push({ caseId: fixture.id, route: useLibrary ? '/api/chat' : '/api/chat/notes', status: response.status,
      outcome: fixture.class === 'reflection' || fixture.class === 'mixed' ? 'not-supported' : 'executed-structural-only',
      suppliedHighlightIds: highlightIds, requiredIds: fixture.requiredIds, fullStoredTextPresentIds: presentIds,
      missingRequiredTextIds: fixture.requiredIds.filter((id) => !presentIds.includes(id)),
      queriedTables: [...state.tables], queriedRpcs: [...state.rpcCalls], generationCalled: state.generationCalled,
      exactStoredQuotePresent: fixture.exactQuote ? state.system.includes(fixture.exactQuote) : null,
      contextSha256: createHash('sha256').update(state.system).digest('hex'),
      semanticRecall: null, modelAbstention: null, evidenceTokens: null,
    });
  }
  // Library-personal probe: real current route receives a reflections request;
  // record the tables it actually queries, rather than inferring from source.
  state.system = ''; state.tables = []; state.rpcCalls = []; state.selected = [];
  const personalProbe = await libraryPost(new NextRequest('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'Explain my own reflections about attention.' }], scope: ['highlight', 'reflection'] }) }));
  expect(personalProbe.status).toBe(200);
  expect(state.tables).not.toContain('user_reflections');
  expect(state.tables).not.toContain('user_highlights');
  const record = {
    fixtureVersion: corpus.version, applicationCommit: head, generatedAt: new Date().toISOString(),
    runner: 'scripts/run-personal-retrieval-baseline.mjs', measurementKind: 'executed-route-structural-baseline',
    provider: { mode: 'deterministic provider and database doubles', generation: 'stubbed; no real model called', embedding: 'fixed vectors; no semantic-ranking measurement', tokenizer: null },
    limitations: ['Not database authorization proof: doubles filter ownership/deletion.', 'Source RPC matches are supplied by fixture, not measured semantic search.', 'No model quality, abstention, token-budget, or release-threshold pass is claimed.', 'First-page exclusion is simulated via the actual legacy request contract; database over-cap proof remains a separate runner.'],
    corpusSha256: createHash('sha256').update(readFileSync('tests/fixtures/retrieval/corpus-v1.json')).digest('hex'),
    releaseQualityGate: 'not-evaluated', aggregation: 'case-level structural observations only; no semantic aggregate', results,
    libraryPersonalProbe: { status: personalProbe.status, outcome: 'not-supported', queriedTables: state.tables, queriedRpcs: state.rpcCalls },
  };
  expect(results).toHaveLength(58);
  expect(results.filter((r) => r.caseId.startsWith('reflection-')).every((r) => r.missingRequiredTextIds.length === 1)).toBe(true);
  expect(results.find((r) => r.caseId === 'highlight-risk')?.exactStoredQuotePresent).toBe(false);
  writeFileSync(process.env.PERSONAL_RETRIEVAL_BASELINE_PATH || 'tests/fixtures/retrieval/baseline-v1.json', JSON.stringify(record, null, 2) + '\n');
  vi.unstubAllEnvs();
});

it('keeps the versioned corpus complete and references only declared evidence', () => {
  const ids = new Set(corpus.evidence.map((e) => e.id));
  expect(ids.size).toBe(corpus.evidence.length);
  expect(new Set(corpus.cases.map((c) => c.id)).size).toBe(58);
  for (const kind of ['source_segment', 'highlight', 'reflection']) {
    const cases = corpus.cases.filter((c) => c.class === kind);
    expect(cases).toHaveLength(12);
    for (const category of ['exact_quote', 'distractor', 'semantic_paraphrase']) {
      expect(cases.filter((c) => c.kind === category)).toHaveLength(4);
    }
  }
  expect(corpus.cases.filter((c) => c.class === 'mixed')).toHaveLength(6);
  expect(corpus.cases.filter((c) => c.class === 'abstention')).toHaveLength(8);
  expect(corpus.cases.filter((c) => c.class === 'exclusion')).toHaveLength(8);
  for (const fixture of corpus.cases) {
    for (const id of [...fixture.requiredIds, ...fixture.eligibleIds, ...fixture.distractorIds]) expect(ids.has(id)).toBe(true);
    expect(fixture.requiredIds.every((id) => fixture.eligibleIds.includes(id))).toBe(true);
    expect(fixture.distractorIds.some((id) => fixture.eligibleIds.includes(id))).toBe(false);
    if (fixture.exactQuote) expect(corpus.evidence.find((e) => e.id === fixture.requiredIds[0])?.text).toBe(fixture.exactQuote);
  }
});
