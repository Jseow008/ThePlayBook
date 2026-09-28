import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCapacity } from './report.mjs';
const targets = { search: { p95Ms: 2000, minimumSamples: 100 }, export: { maxMs: 60000, minimumSamples: 6 } };
const row = (operation, outcome = 'success', durationMs = 100) => ({operation, outcome, durationMs, phase: 'steady'});
const valid = () => [...Array.from({length:100}, () => row('search')), ...Array.from({length:6}, () => row('export'))];
const report = (samples, extra = {}) => summarizeCapacity({samples, planned:106, started:106, targets, ...extra});
test('missing and warmup-only evidence cannot pass', () => {
    assert.equal(report([]).verdict, 'insufficient_evidence');
    assert.equal(report(valid().map(x => ({...x,phase:'warmup'}))).verdict, 'insufficient_evidence');
});
test('complete admitted actions pass and exports have no percentile claim', () => {
    const result = report(valid());
    assert.equal(result.verdict, 'passed');
    assert.equal(result.operations.export.p95Ms, null);
});
test('unplanned quota rejections prevent a capacity pass', () => {
    assert.equal(report([...valid(),row('search','restricted')]).verdict, 'admission_constrained');
    assert.equal(report([...valid(),{...row('search','restricted'),phase:'admission_probe'}]).verdict, 'passed');
});
test('one corrupt result fails regardless of the large successful denominator', () => {
    assert.equal(report([...valid(),row('search','integrity_failure')]).verdict, 'failed');
});
test('latency, dropped load and early termination each prevent a pass', () => {
    assert.equal(report(valid().map(x=>({...x,durationMs:61000}))).verdict,'failed');
    assert.equal(report(valid(),{started:100}).verdict,'failed');
    assert.equal(report(valid(),{aborted:true}).verdict,'failed');
});
test('errors cannot be hidden by another operation having more samples', () => {
    assert.equal(report([...valid(),row('export','failure')]).verdict,'failed');
});
