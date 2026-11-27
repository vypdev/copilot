'use strict';

if (require.main === module) throw new Error('Use the independently reviewed immutable bootstrap; direct qualification runners are unsupported.');

const { readFileSync } = require('node:fs');
const { spawnQualificationDriver } = require('../execution-provenance.cjs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { corpus } = require('./configuration.cjs');
const plan = require('./configuration.cjs');
const { requirePinnedRuntime, qualificationProvenance, selectedPlanProvenance, expectedQualificationContext } = require('./implementation.cjs');

function validateCorpusProvenance(directory, result) {
    const provenance = qualificationProvenance(plan);
    const hash = input => createHash('sha256').update(input).digest('hex');
    const root = path.resolve(__dirname, '../../../../..');
    const planFile = process.env.COPILOT_EV07_PLAN ? path.resolve(process.env.COPILOT_EV07_PLAN) : path.join(__dirname, 'plan.json');
    const source = readFileSync(plan.schemaVersion === 2 ? require('../../issue974/corpus-selection.cjs').selectedCorpus(plan, root).file
        : path.join(root, 'quality/bugbot/corpus.v1.json'));
    assert.equal(hash(source), corpus.sha256);
    const inventory = JSON.parse(source);
    const predictions = JSON.parse(readFileSync(path.join(directory, 'corpus-v3/predictions.json'), 'utf8'));
    const ledger = readFileSync(path.join(directory, 'corpus-v3/corpus.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const starts = ledger.filter(row => row.event === 'start'), finishes = ledger.filter(row => row.event === 'finish');
    assert.equal(starts.length, 1); assert.equal(finishes.length, 1);
    const start = starts[0], finish = finishes[0];
    assert.equal(start.plan, hash(readFileSync(planFile)));
    assert.deepEqual(start.preregistration, selectedPlanProvenance());
    assert.equal(start.runner, hash(readFileSync(path.join(__dirname, 'corpus.cjs'))));
    assert.equal(start.runner, plan.inspectedArtifacts?.['corpus.cjs']);
    assert.equal(start.implementation, plan.implementation);
    assert.deepEqual(start.provenance, expectedQualificationContext(provenance, plan, 'host'));
    assert.equal(start.corpus, corpus.sha256);
    assert.equal(start.gitHubMutationPorts, 0);
    assert.deepEqual(start.configuration, plan.detector);
    requirePinnedRuntime(start.cli);
    assert.deepEqual(finish, { event: 'finish', complete: true, passed: true, githubWriteAttempts: 0, workspaceUnchanged: true });
    const rows = ledger.filter(row => row.event === 'case');
    if (plan.schemaVersion === 2) {
        assert.equal(result.attemptsComplete, true, 'complete application-attempt evidence required');
        const slots = ledger.filter(row => row.event === 'case-slot');
        assert.deepEqual(slots, inventory.cases.map((item, index) => ({ event: 'case-slot', index, id: item.id, status: 'not-started' })));
        require('../../issue974/attempt-ledger.cjs').validateCompleteAttempts(ledger, rows, plan,
            path.join(directory, 'corpus-v3/attempts'));
        if (plan.containment) {
            assert.equal(result.containmentComplete, true, 'complete stopped-scope evidence required');
            assert.deepEqual(ledger.filter(row => row.event === 'case-dispatch'), inventory.cases.map((item, index) =>
                ({ event: 'case-dispatch', index, id: item.id })), 'one durable outer dispatch per frozen case required');
            require('./load.cjs');
            require(path.join(root, 'src/application/policies/qualification_operation_scope_policy')).requireCompleteQualificationOperations(
                inventory.cases.map(item => ({ operationId: 'corpus:' + item.id, purpose: 'corpus-case' })),
                require('./corpus.cjs').containedOperationRecords(ledger),
                { planSha256: start.plan, implementation: plan.implementation, imageSha256: plan.containment.image.slice(7) });
            assert(start.preflightScope?.namespaceInitStopped === true && start.preflightScope.exitCode === 0
                && start.preflightScope.interrupted === false && start.preflightScope.preflight === true);
        }
    }
    assert.equal(rows.length, corpus.cases);
    assert.equal(new Set(rows.map(row => row.id)).size, corpus.cases);
    assert.equal(predictions.schemaVersion, 1);
    assert.deepEqual(Object.keys(predictions.predictions).sort(), inventory.cases.map(item => item.id).sort());
    const flags = { model: plan.detector.model, modelProvider: plan.detector.modelProvider,
        reasoningEffort: plan.detector.effort, sandbox: 'read-only' };
    for (const row of rows) {
        assert.equal(inventory.cases[row.index]?.id, row.id);
        assert.equal(row.status, 'completed');
        assert.deepEqual(row.predictions, predictions.predictions[row.id]);
        assert(row.calls?.length > 0);
        row.calls.forEach(call => assert.deepEqual(call, flags));
        const runtimeProof = { executableSha256: plan.runtime.executableSha256 ?? plan.runtime.codexSha256,
            ...(plan.runtime.launcherSha256 ? { launcherSha256: plan.runtime.launcherSha256 } : {}),
            ...(plan.runtime.nativeExecutableSha256 ? { nativeExecutableSha256: plan.runtime.nativeExecutableSha256 } : {}) };
        assert.match(runtimeProof.executableSha256 ?? '', /^[a-f0-9]{64}$/u);
        assert.equal(row.runtimeProofs?.length, row.calls.length);
        row.runtimeProofs.forEach(proof => assert.deepEqual(proof, runtimeProof));
        if (plan.containment) {
            assert.equal(row.namespaceInitStopped, true); assert.equal(row.workspaceUnchanged, true);
            assert.deepEqual(row.workerProvenance, expectedQualificationContext(provenance, plan, 'worker'));
            assert(ledger.some(fact => fact.event === 'operation-stopped' && !fact.preflight
                && fact.scopeId === row.scopeId && fact.identity.operationId === 'corpus:' + row.id));
        }
    }
    require('./load.cjs');
    const { evaluateBugbotBenchmark } = require(path.join(root, 'src/tooling/bugbot_benchmark'));
    const gates = corpus.gates;
    const score = evaluateBugbotBenchmark(inventory, predictions, { precision: gates.precision, recall: gates.recall,
        f1: gates.f1, locationAccuracy: gates.exactLocation, severityAccuracy: gates.severity,
        categoryAccuracy: gates.category, maxConfidenceBrierScore: gates.maxBrier });
    assert.deepEqual(result.score, score);
    assert.deepEqual(score.violations, []); assert.deepEqual(score.missingCases, []);
}

function requirePassingCorpus(campaign) {
    if (!campaign) throw new Error('usage: node launch-full-review.cjs <campaign directory>');
    const directory = path.resolve(campaign);
    let result;
    try { result = JSON.parse(readFileSync(path.join(directory, 'corpus-v3', 'corpus-score.json'), 'utf8')); }
    catch { throw new Error('The independent corpus score is missing, unreadable, or invalid. Full review was not started.'); }
    if (result?.complete !== true || result.completed !== corpus.cases || result.passed !== true
        || result.githubWriteAttempts !== 0 || result.workspaceUnchanged !== true
        || !Array.isArray(result.score?.violations) || result.score.violations.length !== 0
        || !Array.isArray(result.score?.missingCases) || result.score.missingCases.length !== 0) {
        throw new Error('The independent corpus gate did not pass. Full review was not started.');
    }
    try { validateCorpusProvenance(directory, result); }
    catch { throw new Error('The independent corpus provenance does not match the frozen run. Full review was not started.'); }
    return directory;
}

function launchFullReview(campaign, launch) {
    const directory = requirePassingCorpus(campaign);
    return launch ? launch(process.execPath, [path.join(__dirname, 'full-review.cjs'), directory], { stdio: 'inherit' })
        : spawnQualificationDriver('full-review-runner', [directory], { stdio: 'inherit' });
}

async function run(campaign) {
    require('../execution-provenance.cjs').requireBootstrapAdmission(path.resolve(__dirname, '../../../../..'));
    const child = launchFullReview(campaign);
    return new Promise((resolve, reject) => {
        const interrupt = () => child.kill('SIGINT');
        const terminate = () => child.kill('SIGTERM');
        process.once('SIGINT', interrupt);
        process.once('SIGTERM', terminate);
        child.once('error', reject);
        child.once('close', (code, signal) => {
            process.removeListener('SIGINT', interrupt);
            process.removeListener('SIGTERM', terminate);
            resolve(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1));
        });
    });
}

module.exports = { run, launchFullReview, requirePassingCorpus };
