'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { scenario, trial } = require('./run.cjs');

test('matched arms share the initial prompt and closed session, and only on-demand can retrieve', async () => {
    const prior = process.env.BUGBOT_TREE_PRIOR_SUBJECTS;
    const f = scenario('R1', prior, prior);
    const prompts = [];
    const evidence = { kind: 'searchTree', targets: [{ scope: '', workspace: '@domus/frontend',
        match: 'name', query: 'playwright.entry.config.ts', start: null, end: null }] };
    for (const arm of ['fixed', 'repeat', 'on-demand']) {
        const row = { model: 'gpt-6.1-sol', subject: 'R1', arm, repetition: 1 };
        const result = await trial(row, f, () => {}, (message, mode, cwd) => {
            assert.equal(mode, 'closed');
            assert.equal(cwd, null);
            const candidate = /c-869-1-[a-f0-9]{12}/u.exec(message.prompt)[0];
            const fact = { outcome: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, toolTypes: [] };
            if (message.agentId === 'tree-initial') {
                prompts.push(message);
                return { fact, response: { candidate, kind: 'request', verdict: null, citations: [],
                    reason: 'The exact endpoint is missing.', nextStep: null, request: evidence } };
            }
            assert.equal(message.prompt.includes('frontend/playwright.entry.config.ts'), arm === 'on-demand');
            assert.deepEqual(message.options.schema.properties.kind.enum, ['verdict']);
            return { fact, response: { candidate, kind: 'verdict', verdict: 'inconclusive', citations: [],
                reason: 'Fixture verdict.', nextStep: 'Inspect the returned source.', request: null } };
        });
        assert.equal(result.status, 'completed');
        assert.equal(result.calls.length, arm === 'fixed' ? 1 : 2);
        assert.deepEqual(result.writeAttempts, []);
    }
    assert.deepEqual(prompts, [prompts[0], prompts[0], prompts[0]]);
});
