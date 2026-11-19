import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditTotal, maximumProviderCost, measuredProviderCost } from './ai-chat-acceptance-audit.mjs';
test('reserves full context, rejects different models/reasoning and unbounded calls', () => {
    assert.equal(maximumProviderCost('openai', {model:'gpt-6-luna',reasoning:{effort:'none'},max_output_tokens:1600}), .5262);
    for (const body of [{model:'gpt-6.1-sol',reasoning:{effort:'none'},max_output_tokens:1600},{model:'gpt-6-luna',reasoning:{effort:'low'},max_output_tokens:1600},{model:'gpt-6-luna',reasoning:{effort:'none'}}]) assert.throws(() => maximumProviderCost('openai',body));
    assert.equal(maximumProviderCost('google',{requests:[{},{}]}),.0006144);
});
test('unknown/cancelled calls retain reservations, settled calls release only measured cost', () => {
    const rows=[{type:'reserve',id:'a',maxUsd:.2112},{type:'reserve',id:'b',maxUsd:.2112},{type:'settle',id:'a',costUsd:.001}];
    assert.equal(auditTotal(rows,.006),.2182);
    assert.equal(measuredProviderCost('openai',{response:{usage:{input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:500,cache_write_tokens:0}}}}).costUsd,.000105);
    assert.equal(measuredProviderCost('openai',{}),null);
    assert.equal(measuredProviderCost('openai',{usage:{input_tokens:-1,output_tokens:0}}),null);
    assert.equal(measuredProviderCost('google',{}),null);
});
test('cache writes include duration-specific charges and unknown writes use the upper rate', () => {
    const usage={input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:100,cache_write_tokens:500,cache_write_tokens_details:{ttl_30m_tokens:500,ttl_12h_tokens:0}}};
    assert(Math.abs(measuredProviderCost('openai',{usage}).costUsd-.0001535)<1e-12);
    assert.equal(measuredProviderCost('openai',{usage:{input_tokens:1000,output_tokens:0}}).costUsd,.00025);
    assert.equal(measuredProviderCost('openai',{usage:{input_tokens:100,output_tokens:0,input_tokens_details:{cached_tokens:80,cache_write_tokens:50}}}),null);
});
