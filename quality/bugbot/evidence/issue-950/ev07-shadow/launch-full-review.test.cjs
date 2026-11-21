'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { launchFullReview } = require('./launch-full-review.cjs');
const historicalScore = require('./corpus-score.json');
const { requirePinnedImplementation, requirePinnedRuntime } = require('./implementation.cjs');

function fixture(t, encoded) {
    const directory = mkdtempSync(path.join(tmpdir(), 'ev07-dispatch-fixture-'));
    t.after(() => rmSync(directory, { force: true, recursive: true }));
    mkdirSync(path.join(directory, 'corpus-v3'));
    if (encoded !== undefined) writeFileSync(path.join(directory, 'corpus-v3', 'corpus-score.json'), encoded);
    return directory;
}

function commitPlan(file) {
    const directory = path.dirname(file);
    const git = (...args) => execFileSync('git', ['-C', directory, ...args], {
        encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
            GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
    }).trim();
    git('init', '--quiet', '--template=');
    git('add', path.basename(file));
    const commit = git('commit-tree', git('write-tree'), '-m', 'Preregister synthetic admission control');
    git('update-ref', 'HEAD', commit);
    return { commit, path: path.basename(file), blob: git('rev-parse', `${commit}:${path.basename(file)}`),
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex') };
}

for (const [name, data] of [
    ['missing', undefined],
    ['malformed', '{'],
    ['incomplete', JSON.stringify({ ...historicalScore, complete: false })],
    ['too few cases', JSON.stringify({ ...historicalScore, completed: 173 })],
    ['failed', JSON.stringify({ ...historicalScore, passed: false })],
    ['attempted writes', JSON.stringify({ ...historicalScore, githubWriteAttempts: 1 })],
    ['changed workspace', JSON.stringify({ ...historicalScore, workspaceUnchanged: false })],
    ['contradictory score', JSON.stringify({ ...historicalScore, score: { violations: ['location'], missingCases: [] } })],
]) {
    test(`blocks a ${name} corpus gate at dispatch`, t => {
        const launch = () => assert.fail('no provider work may start');
        const directory = fixture(t, data);
        assert.throws(() => launchFullReview(directory, launch), /independent corpus/);
        const direct = spawnSync(process.execPath, [path.join(__dirname, 'full-review.cjs'), directory], { encoding: 'utf8' });
        assert.equal(direct.status, 1);
        assert.match(direct.stderr, /immutable bootstrap/u);
        assert.equal(existsSync(path.join(directory, 'full-review')), false);
    });
}

test('rejects the unbound historical score without changing its recorded result', t => {
    const directory = fixture(t, JSON.stringify(historicalScore));
    const launch = () => assert.fail('unbound historical summaries cannot launch provider work');
    assert.throws(() => launchFullReview(directory, launch), /corpus provenance/u);
});

function boundCorpusFixture(t) {
    require('./load.cjs');
    const root = path.resolve(__dirname, '../../../../..');
    const { evaluateBugbotBenchmark } = require(path.join(root, 'src/tooling/bugbot_benchmark'));
    const directory = fixture(t);
    const hash = value => createHash('sha256').update(value).digest('hex');
    const sourceProof = require('../execution-provenance.cjs');
    const implementation = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const plan = { ...require('./configuration.cjs'), implementation,
        runtime: { ...sourceProof.runtimeIdentity(root), codex: 'codex-cli 0.169.1', codexSha256: 'a'.repeat(64) },
        inspectedArtifacts: Object.fromEntries(require('./implementation.cjs').qualificationDrivers
            .map(file => [file, hash(readFileSync(path.join(__dirname, file)))])) };
    const planFile = path.join(directory, 'plan.json');
    writeFileSync(planFile, JSON.stringify(plan));
    const preregistration = commitPlan(planFile);
    const corpus = JSON.parse(readFileSync(path.join(root, 'quality/bugbot/corpus.v1.json')));
    const predictions = { schemaVersion: 1, predictions: Object.fromEntries(corpus.cases.map(item =>
        [item.id, item.expected.map(finding => ({ ...finding, confidence: 1 }))])) };
    const rows = [{ event: 'start', cli: plan.runtime.codex, configuration: plan.detector, plan: hash(readFileSync(planFile)),
        preregistration, provenance: { ...sourceProof.attestSource(root, implementation), drivers: plan.inspectedArtifacts,
            runtime: sourceProof.runtimeIdentity(root) },
        runner: hash(readFileSync(path.join(__dirname, 'corpus.cjs'))), implementation: plan.implementation,
        corpus: plan.corpus.sha256, gitHubMutationPorts: 0 }, ...corpus.cases.map((item, index) => ({ event: 'case', index,
        id: item.id, status: 'completed', predictions: predictions.predictions[item.id], runtimeProofs: [{ executableSha256: plan.runtime.codexSha256 }], calls: [{ model: plan.detector.model,
            modelProvider: plan.detector.modelProvider, reasoningEffort: plan.detector.effort, sandbox: 'read-only' }] })),
    { event: 'finish', complete: true, passed: true, githubWriteAttempts: 0, workspaceUnchanged: true }];
    writeFileSync(path.join(directory, 'corpus-v3/predictions.json'), JSON.stringify(predictions));
    const score = { complete: true, completed: 174, passed: true, githubWriteAttempts: 0, workspaceUnchanged: true,
        score: evaluateBugbotBenchmark(corpus, predictions) };
    writeFileSync(path.join(directory, 'corpus-v3/corpus-score.json'), JSON.stringify(score));
    return { directory, planFile, rows, score };
}

for (const mode of ['valid', 'plan', 'implementation', 'runtime', 'runner', 'prediction', 'score', 'duplicate', 'flags', 'uncommitted-plan', 'omitted-positives',
    'missing-executable-proof', 'foreign-executable-proof', 'foreign-launcher-proof',
    'changed-review-driver', 'missing-loader', 'changed-launcher']) {
    test(`binds independent corpus dispatch to its actual ledger and score: ${mode}`, t => {
        const f = boundCorpusFixture(t);
        if (mode === 'plan') f.rows[0].plan = 'f'.repeat(64);
        if (mode === 'implementation') f.rows[0].implementation = 'f'.repeat(40);
        if (mode === 'runtime') f.rows[0].cli = 'codex-cli 0.170.0';
        if (mode === 'runner') f.rows[0].runner = 'f'.repeat(64);
        if (mode === 'prediction') f.rows[1].predictions = [];
        if (mode === 'score') {
            f.score.score.metrics.precision = 0.5;
            writeFileSync(path.join(f.directory, 'corpus-v3/corpus-score.json'), JSON.stringify(f.score));
        }
        if (mode === 'duplicate') f.rows[2] = f.rows[1];
        if (mode === 'flags') f.rows[1].calls[0].model = 'unregistered-model';
        if (mode === 'missing-executable-proof') delete f.rows[1].runtimeProofs;
        if (mode === 'foreign-executable-proof') f.rows[1].runtimeProofs[0].executableSha256 = 'f'.repeat(64);
        if (mode === 'foreign-launcher-proof') f.rows[1].runtimeProofs[0].launcherSha256 = 'f'.repeat(64);
        if (mode === 'uncommitted-plan' || mode === 'omitted-positives') {
            const selected = JSON.parse(readFileSync(f.planFile));
            if (mode === 'omitted-positives') selected.repositoryCohort.order = selected.repositoryCohort.order.filter(id => id.endsWith('1'));
            writeFileSync(f.planFile, JSON.stringify(selected, null, 2));
            f.rows[0].plan = createHash('sha256').update(readFileSync(f.planFile)).digest('hex');
            if (mode === 'omitted-positives') f.rows[0].preregistration = commitPlan(f.planFile);
        }
        if (['changed-review-driver', 'missing-loader', 'changed-launcher'].includes(mode)) {
            const selected = JSON.parse(readFileSync(f.planFile));
            if (mode === 'missing-loader') delete selected.inspectedArtifacts['load.cjs'];
            else selected.inspectedArtifacts[mode === 'changed-launcher' ? 'launch-full-review.cjs' : 'review.cjs'] = 'f'.repeat(64);
            writeFileSync(f.planFile, JSON.stringify(selected));
            f.rows[0].plan = createHash('sha256').update(readFileSync(f.planFile)).digest('hex');
        }
        writeFileSync(path.join(f.directory, 'corpus-v3/corpus.jsonl'), f.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
        const run = spawnSync(process.execPath, ['-e',
            'require(process.argv[1]).launchFullReview(process.argv[2],()=>{process.stdout.write("admitted");return {}})',
            path.join(__dirname, 'launch-full-review.cjs'), f.directory], {
            encoding: 'utf8', env: { ...process.env, COPILOT_EV07_PLAN: f.planFile },
        });
        if (mode === 'valid') { assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, 'admitted'); }
        else { assert.equal(run.status, 1); assert.match(run.stderr, /corpus provenance/u); assert.equal(run.stdout, ''); }
    });
}

test('requires the exact accredited CLI version before dispatch', () => {
    assert.equal(requirePinnedRuntime('codex-cli 0.169.1', { codex: 'codex-cli 0.169.1' }), 'codex-cli 0.169.1');
    assert.throws(() => requirePinnedRuntime('codex-cli 0.170.0', { codex: 'codex-cli 0.169.1' }), /CLI version differs/u);
    assert.throws(() => requirePinnedRuntime('codex-cli 0.169.1', {}), /CLI version unavailable/u);
});

test('attests the Git implementation before dispatch and rejects changed tracked or untracked sources', t => {
    const repository = fixture(t);
    const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet', '--template=');
    mkdirSync(path.join(repository, 'src'));
    const file = path.join(repository, 'src', 'review.ts');
    writeFileSync(file, 'export const review = true;\n');
    writeFileSync(path.join(repository, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    writeFileSync(path.join(repository, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2020"}}');
    git('add', 'src', 'pnpm-lock.yaml', 'tsconfig.json');
    git('-c', 'user.name=Test', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Frozen implementation');
    const pin = git('rev-parse', 'HEAD');

    assert.equal(requirePinnedImplementation(repository, pin), pin);
    writeFileSync(file, 'export const review = false;\n');
    assert.throws(() => requirePinnedImplementation(repository, pin), /does not match/u);
    git('add', 'src');
    writeFileSync(file, 'export const review = true;\n');
    assert.throws(() => requirePinnedImplementation(repository, pin), /staged application source/u);
    git('restore', '--staged', 'src');
    writeFileSync(path.join(repository, 'src', 'review.js'), 'extra source');
    assert.throws(() => requirePinnedImplementation(repository, pin), /untracked application source/u);
});

test('attests the shipping compiler configuration before any model dispatch', t => {
    const repository = fixture(t);
    const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet', '--template=');
    mkdirSync(path.join(repository, 'src'));
    writeFileSync(path.join(repository, 'src/review.ts'), 'export const review = true;');
    writeFileSync(path.join(repository, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
    writeFileSync(path.join(repository, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2020"}}');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Compiler fixture');
    const pin = git('rev-parse', 'HEAD');
    assert.equal(requirePinnedImplementation(repository, pin), pin);
    writeFileSync(path.join(repository, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}');
    assert.throws(() => requirePinnedImplementation(repository, pin), /does not match/u);
    git('add', 'tsconfig.json');
    assert.throws(() => requirePinnedImplementation(repository, pin), /does not match/u);
});

test('selects the exact preregistered campaign plan without changing the historical default', t => {
    const directory = fixture(t);
    const file = path.join(directory, 'campaign.json');
    writeFileSync(file, JSON.stringify({ implementation: 'f'.repeat(40) }));
    const selected = spawnSync(process.execPath, ['-e',
        'process.stdout.write(require(process.argv[1]).implementation)',
        path.join(__dirname, 'configuration.cjs')], {
        encoding: 'utf8', env: { ...process.env, COPILOT_EV07_PLAN: file },
    });
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(selected.stdout, 'f'.repeat(40));
});


test('uses the shipping compiler options when initializing the production progress clock', () => {
    const execute = spawnSync(process.execPath, ['-e',
        'require(process.argv[1]); const {BugbotReviewProgress}=require(process.argv[2]); new BugbotReviewProgress({},undefined,true,"en-US",()=>1000);',
        path.join(__dirname, 'load.cjs'), path.join(__dirname, '../../../../../src/application/usecases/steps/commit/bugbot/bugbot_review_progress')],
    { encoding: 'utf8' });
    assert.equal(execute.status, 0, execute.stderr);
});
