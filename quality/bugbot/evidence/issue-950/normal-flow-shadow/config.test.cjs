'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { selectVerifierProfiles, verifyMatchedCandidate } = require('./run.cjs');

const luna = { provider: 'codex', modelProvider: 'openai', model: 'gpt-6-luna', effort: 'xhigh' };
const sol = { provider: 'codex', modelProvider: 'openai', model: 'gpt-6.1-sol', effort: 'xhigh' };

test('manifest selects Sol with xhigh for the experimental verifier', () => {
    const { primary, experimental, comparison } = selectVerifierProfiles(
        { experimentalVerifier: { model: sol.model, effort: sol.effort }, compareInheritedVerifier: true }, luna,
    );
    assert.deepEqual(primary, sol);
    assert.equal(experimental, primary);
    assert.equal(comparison, luna);
});

test('matched arms receive the same pinned candidate and record independent results', async () => {
    const candidate = Object.freeze({ id: 'fixed', headSha: 'a'.repeat(40), anchor: { path: 'view.ts', line: 12 } });
    const seen = [], outcomes = [];
    const experimental = { status: 'verdict', verdict: 'confirmed' };
    const inherited = { status: 'verdict', verdict: 'inconclusive' };
    const result = await verifyMatchedCandidate({ candidate, configuration: sol },
        { primary: sol, experimental: sol, comparison: luna }, async (arm, request) => {
            assert.equal(request.candidate, candidate);
            seen.push([arm, request.configuration]);
            return arm === 'experimental' ? experimental : inherited;
        }, event => outcomes.push(event));
    assert.deepEqual(seen, [['experimental', sol], ['inherited', luna]]);
    assert.deepEqual(outcomes, [{ event: 'matched-verification-result', id: 'fixed', inherited, experimental }]);
    assert.equal(result, experimental);
});

test('omitting the experimental profile opens only the inherited arm', async () => {
    const profiles = selectVerifierProfiles({}, luna);
    assert.equal(profiles.primary, luna);
    const calls = [];
    await verifyMatchedCandidate({ candidate: { id: 'fixture' }, configuration: luna },
        profiles, async (arm, { configuration }) => calls.push([arm, configuration]), assert.fail);
    assert.deepEqual(calls, [['inherited', luna]]);
    assert.throws(() => selectVerifierProfiles({ experimentalVerifier: { model: ' ' } }, luna), /model required/u);
});

test('a rejected matched arm preserves the other arm and never substitutes its verdict', async () => {
    const events = [];
    const inherited = { status: 'verdict', verdict: 'confirmed' };
    const result = await verifyMatchedCandidate({ candidate: { id: 'fixture' }, configuration: sol },
        { primary: sol, experimental: sol, comparison: luna }, async arm => {
            if (arm === 'experimental') throw Error('provider failed');
            return inherited;
        }, event => events.push(event));
    assert.deepEqual(result, { status: 'technical-failure', reason: 'verifier-unavailable' });
    assert.equal(events[0].inherited, inherited);
    assert.deepEqual(events[0].experimental, result);
});
