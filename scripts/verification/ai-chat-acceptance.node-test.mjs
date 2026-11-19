import {test} from 'node:test';import assert from 'node:assert/strict';
import {acceptancePayload,acceptanceCases,decodeStream} from './ai-chat-acceptance.mjs';
test('Notes requests use the application timestamp UUID and bind it to the submitted question',()=>{
 const before=Date.now(),result=acceptancePayload({chat:'notes',question:'A frozen question',scope:{version:1,itemType:'reflection'}},{},'verified-owner').body;
 assert.equal(result.replay.expectedOwner,'verified-owner');assert.equal(result.replay.questionId,result.messages.at(-1).id);assert.equal(result.replay.attemptId[14],'7');
 const stamp=parseInt(result.replay.attemptId.replaceAll('-','').slice(0,12),16);assert(stamp>=before&&stamp<=Date.now());
});
test('capture associates text and citations with one complete SSE body',()=>{
 const body='data: {"type":"text-delta","delta":"Stored text"}\n\ndata: {"type":"data-citations","data":[{"label":"Your reflection"}]}\n\ndata: [DONE]\n';
 assert.equal(decodeStream(body).text,'Stored text');assert.equal(decodeStream(body).citations[0].label,'Your reflection');
});

test('held cases are split into complete disjoint chat groups below the normal daily allowance',()=>{
 const plan={held:['library','notes','author'].flatMap(chat=>Array.from({length:10},(_,i)=>({id:chat+i,chat})))};
 const groups=['held-library','held-notes','held-author'].map(stage=>acceptanceCases(plan,stage));
 assert(groups.every(group=>group.length===10));assert.equal(new Set(groups.flat().map(x=>x.id)).size,30);
});
