'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { anchorFinding, decide, diffExcerpt, limits, remainingVerifierBudget, retryDeadline, verifierRequest } = require('./verification.cjs');
const file = 'tests/sample.py';
const finding = { id: 'server-candidate', file, line: 130, title: 'Required argument', description: 'Caller omits argument' };
const hunk = { filename: file, patch: '@@ -128,4 +128,6 @@\n     data_volume: str,\n     expected_schema: int = 10,\n+    *,\n+    expected_schema_fixture: int,\n ) -> None:\n     run_test()\n' };
const timeout = { outcome: 'provider-turn-timeout', usage: null, turnCompletions: 0, toolTypes: [] };
const usage = (input, output=0) => ({ outcome:'completed', usage:{input_tokens:input,output_tokens:output},turnCompletions:1,toolTypes:[] });
const response = { id:'candidate', verdict:'confirmed', citations:['evidence-1'], reason:'The new required parameter has no argument at the caller.' };

test('moves a standalone argument separator to the unique substantive addition', () => {
    assert.deepEqual(anchorFinding(finding,[hunk]),{line:131,kind:'substantive-companion'});
    assert.deepEqual(anchorFinding({...finding,line:131},[hunk]),{line:131,kind:'changed'});
});
test('retains a significant lone punctuation addition', () => {
    const only = {...hunk,patch:'@@ -128,2 +128,3 @@\n context\n+ *,\n next\n'};
    assert.deepEqual(anchorFinding({...finding,line:129},[only]),{line:129,kind:'changed'});
});
test('maps a removed guard to the first surviving line and rejects foreign anchors', () => {
    const deleted = {...hunk,patch:'@@ -224,5 +224,3 @@\n context\n context\n- if guard\n-     reject\n plan\n'};
    assert.deepEqual(anchorFinding({...finding,line:226},[deleted]),{line:226,kind:'deletion-neighbor'});
    assert.equal(anchorFinding({...finding,line:222},[deleted]),null);
    assert.equal(anchorFinding({...finding,file:'another.py'},[hunk]),null);
});
test('rejects a nearby unchanged line when two different anchors are possible', () => {
    const ambiguous = {...hunk,patch:'@@ -8,3 +8,5 @@\n context\n+ first\n context\n+ second\n context\n'};
    assert.equal(anchorFinding({...finding,line:10},[ambiguous]),null);
});
test('keeps the selected canonical hunk and rejects distant excerpts', () => {
    assert.match(diffExcerpt({...finding,line:131},[hunk]),/expected_schema_fixture/u);
    assert.equal(diffExcerpt({...finding,line:300},[hunk]),null);
});
test('uses closed citations and preserves correlation through the original host ID', () => {
    const receipts = [{id:'evidence-1',text:'original caller'}];
    const request = verifierRequest({},finding,hunk.patch,receipts,(text,kind)=>`[${kind}] ${text}`);
    assert(!request.prompt.includes(finding.id));
    assert.deepEqual(request.options.schema.properties.citations.items.enum,['diff','evidence-1']);
    assert.equal(decide(response,finding.id,receipts).id,finding.id);
    assert.throws(()=>decide({...response,citations:['forged']},finding.id,receipts),/verdict-citation/u);
    assert.throws(()=>decide({...response,citations:['diff']},finding.id,receipts),/verdict-missing-witness/u);
});
test('reserves unknown usage and retries one fresh timeout inside the same wall budget', () => {
    assert.equal(retryDeadline(timeout,[timeout],48000),42000);
    assert.equal(retryDeadline(timeout,[timeout],75500),0);
    assert.equal(retryDeadline(timeout,[timeout,timeout],49000),0);
    assert.equal(retryDeadline(timeout,[usage(24000),timeout],48000),0);
});
test('never retries terminal usage, tool events or malformed output', () => {
    assert.equal(retryDeadline({...timeout,turnCompletions:1},[timeout],48000),0);
    assert.equal(retryDeadline({...timeout,toolTypes:['command_execution']},[timeout],48000),0);
    assert.equal(retryDeadline({...timeout,outcome:'provider-json-invalid'},[timeout],48000),0);
});
test('caps actual token spend, call count and unknown accounting', () => {
    assert.throws(()=>remainingVerifierBudget([usage(32769)],5),/verifier-token-budget/u);
    assert.throws(()=>remainingVerifierBudget([usage(8000,4097)],5),/verifier-token-budget/u);
    assert.throws(()=>remainingVerifierBudget([{usage:null,outcome:'provider-launch'}],5),/verifier-usage-unavailable/u);
    assert(!remainingVerifierBudget(Array.from({length:limits.verifierCalls},()=>usage(1)),5));
    assert(!remainingVerifierBudget([],limits.subjectWallMs));
});
