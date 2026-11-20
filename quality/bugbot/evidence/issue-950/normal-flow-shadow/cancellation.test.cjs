'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const { verifyMatchedCandidate } = require('./run.cjs');
const { authenticatedFixture } = require('./authenticated-fixture.cjs');
const retained = [];
after(() => {
    if (process.env.COPILOT_CANCELLATION_EVIDENCE) fs.writeFileSync(process.env.COPILOT_CANCELLATION_EVIDENCE,
        JSON.stringify({ method: 'public immutable bootstrap; actual normal-flow runner and ordinary operation; controlled providers',
            modelCalls: 0, evaluatedPrWriteAttempts: 0, attempts: retained }, null, 2) + '\n', { flag: 'wx' });
});

// This owned program is committed inside the fixture and only runs after public bootstrap admission.
async function controlledRun(run, lab, number, output, manifest, stage, head) {
    const cancellation = new AbortController();
    let detectorCalls = 0, verifierCalls = 0;
    const pending = [];
    const result = await run(lab, number, output, manifest, {
        signal: cancellation.signal,
        beforeReview() { if (stage === 'before-detection') cancellation.abort(); },
        progress: { observe(observation) {
            if (stage === 'between-preparation-and-verification' && observation.stage === 'verifying') cancellation.abort();
        } },
        findings: { async query(request) {
            detectorCalls++;
            pending.push({ stage: 'detector', abortedAtEntry: request.signal.aborted });
            if (stage === 'during-detection') cancellation.abort();
            if (stage === 'provider-failure') throw new Error('Owned non-cancellation provider failure');
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
    require('node:fs').writeFileSync(output + '.control.json', JSON.stringify({ result, pending, detectorCalls, verifierCalls }),
        { flag: 'wx', mode: 0o600 });
    return result;
}

for (const stage of ['before-detection', 'during-detection', 'between-preparation-and-verification',
    'during-verification', 'after-provider-interruption', 'uninterrupted', 'provider-failure']) {
    test('the authenticated actual normal-flow operation preserves its terminal state: ' + stage, t => {
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
        const output = path.join(directory, 'attempt.jsonl');
        const manifest = { publication: 'dry-run', effort: 'xhigh', subjects: [{
            repository: 'owner/project', number: 1, baseRef: 'master', headRef: 'review', head, base, tree, baseTree,
            model: 'gpt-6-luna',
        }] };
        // Append an owned wrapper to the disposable driver; the production run
        // function remains unchanged and every fixture byte is committed/pinned.
        const suffix = '\nconst fixtureOrdinaryRun = module.exports.run;\nmodule.exports.run = (...args) => ('
            + controlledRun.toString() + ')(fixtureOrdinaryRun, ...args, ' + JSON.stringify(stage) + ', ' + JSON.stringify(head) + ');\n';
        const fixture = authenticatedFixture(t, manifest, suffix);
        const child = fixture.launch(directory, 1, output);
        const { result, pending, detectorCalls, verifierCalls } = JSON.parse(fs.readFileSync(output + '.control.json', 'utf8'));
        const rows = fs.readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse);
        const terminal = rows.find(row => row.event === 'workflow-result');
        const admitted = rows.find(row => row.event === 'plan').provenance;
        assert.equal(admitted.bootstrap.planCommit, fixture.pins.revision);
        assert.equal(admitted.manifest.sha256, fixture.pins.planSha256);
        retained.push({ stage, pins: fixture.pins, pending, detectorCalls, verifierCalls, exitCode: child.status, rows });
        assert.deepEqual(result.writes, []);
        assert.equal(terminal.checkoutUnchanged, true);
        if (stage === 'uninterrupted') {
            assert.equal(child.status, 0, child.stderr);
            assert.equal(result.status, 'completed');
            assert.equal(result.results[0].success, true);
            assert.equal(detectorCalls, 1); assert.equal(verifierCalls, 1);
        } else if (stage === 'provider-failure') {
            assert.equal(result.status, 'failed');
            assert.equal(result.results[0].success, false);
            assert.equal(child.status, 1, 'failed ordinary review must not exit successfully');
            assert(detectorCalls > 0, 'the actual ordinary detector must observe the provider failure');
            assert.equal(verifierCalls, 0);
        } else {
            assert.equal(child.status, 130, child.stderr);
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
