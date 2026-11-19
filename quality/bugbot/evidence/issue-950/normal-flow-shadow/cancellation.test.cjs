'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const { run, verifyMatchedCandidate } = require('./run.cjs');
const retained = [];
after(() => {
    if (process.env.COPILOT_CANCELLATION_EVIDENCE) fs.writeFileSync(process.env.COPILOT_CANCELLATION_EVIDENCE,
        JSON.stringify({ method: 'actual normal-flow runner and ordinary operation; controlled providers',
            modelCalls: 0, evaluatedPrWriteAttempts: 0, attempts: retained }, null, 2) + '\n', { flag: 'wx' });
});

for (const stage of ['before-detection', 'during-detection', 'between-preparation-and-verification',
    'during-verification', 'after-provider-interruption', 'uninterrupted']) {
    test('the actual normal-flow operation preserves explicit cancellation: ' + stage, async t => {
        const directory = fs.mkdtempSync(path.join(tmpdir(), 'bugbot-972-cancel-'));
        t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
        const source = path.join(directory, 'project.git');
        fs.mkdirSync(source);
        const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
        git('init', '--quiet', '--template=');
        fs.writeFileSync(path.join(source, 'index.ts'), 'export const value = 1;\n');
        git('add', '.');
        const commit = () => git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixed source');
        commit();
        const base = git('rev-parse', 'HEAD'), baseTree = git('rev-parse', 'HEAD^{tree}');
        fs.writeFileSync(path.join(source, 'index.ts'), 'export const value = 1;\nexport const added = 2;\n');
        git('add', '.'); commit();
        const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
        const manifest = path.join(directory, 'subjects.json'), output = path.join(directory, 'attempt.jsonl');
        fs.writeFileSync(manifest, JSON.stringify({ publication: 'dry-run', effort: 'xhigh', subjects: [{
            repository: 'owner/project', number: 1, baseRef: 'master', headRef: 'review', head, base, tree, baseTree,
            model: 'gpt-6-luna',
        }] }));
        const cancellation = new AbortController();
        let detectorCalls = 0, verifierCalls = 0;
        const pending = [];
        const result = await run(directory, 1, output, manifest, {
            signal: cancellation.signal,
            beforeReview() { if (stage === 'before-detection') cancellation.abort(); },
            progress: { observe(observation) {
                if (stage === 'between-preparation-and-verification' && observation.stage === 'verifying') cancellation.abort();
            } },
            findings: { async query(request) {
                detectorCalls++;
                pending.push({ stage: 'detector', abortedAtEntry: request.signal.aborted });
                if (stage === 'during-detection') cancellation.abort();
                return { outputLocale: 'en-US', findings: [{ id: 'controlled-candidate', file: 'index.ts', line: 2,
                    title: 'Controlled candidate', description: 'An owned cancellation fixture hypothesis.',
                    codeSnippet: 'export const added = 2;', confidence: 0.99, severity: 'medium', category: 'correctness' }],
                resolved_findings: [], partition_id: request.prompt.match(/Return partition_id exactly as `([^`]+)`/u)?.[1],
                reviewed_head_sha: head };
            } },
            verifier: { async verify(request) {
                verifierCalls++;
                const observation = { stage: 'verifier', id: request.candidate.id, abortedAtEntry: request.signal.aborted };
                pending.push(observation);
                if (stage === 'during-verification' || stage === 'after-provider-interruption') {
                    cancellation.abort();
                    observation.abortedAfterInterruption = request.signal.aborted;
                    return { status: 'technical-failure', reason: stage === 'after-provider-interruption'
                        ? 'provider-turn-failed' : 'investigation-canceled' };
                }
                return { status: 'verdict', verdict: 'inconclusive', reason: 'Controlled missing evidence.',
                    missing: 'A test-only source gap.', citations: [], premises: [] };
            } },
        });
        const rows = fs.readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse);
        const terminal = rows.find(row => row.event === 'workflow-result');
        retained.push({ stage, pending, detectorCalls, verifierCalls, rows });
        assert.deepEqual(result.writes, []);
        assert.equal(terminal.checkoutUnchanged, true);
        if (stage === 'uninterrupted') {
            assert.equal(result.status, 'completed');
            assert.equal(result.results[0].success, true);
            assert.equal(detectorCalls, 1); assert.equal(verifierCalls, 1);
        } else {
            assert.equal(result.status, 'interrupted');
            assert.equal(result.results[0].success, false);
            assert.equal(result.results[0].payload.bugbotPublicationBlocked, true);
            assert.equal(JSON.stringify(result.results[0].payload).includes('copilot:bugbot-verification'), false);
            assert.equal(verifierCalls, ['during-verification', 'after-provider-interruption'].includes(stage) ? 1 : 0);
            assert.equal(detectorCalls, stage === 'before-detection' ? 0 : 1);
        }
    });
}

test('explicit cancellation in the experimental arm prevents starting the inherited arm', async () => {
    const controller = new AbortController(), calls = [];
    const profile = { provider: 'codex', modelProvider: 'openai', model: 'gpt-6-luna', effort: 'xhigh' };
    await verifyMatchedCandidate({ signal: controller.signal, candidate: { id: 'owned' }, configuration: profile },
        { primary: profile, experimental: profile, comparison: profile }, async arm => {
            calls.push(arm); controller.abort(); return { status: 'technical-failure', reason: 'investigation-canceled' };
        }, () => {});
    assert.deepEqual(calls, ['experimental']);
});
