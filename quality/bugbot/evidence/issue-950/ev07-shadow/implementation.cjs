'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync, lstatSync, realpathSync } = require('node:fs');
const { devNull } = require('node:os');
const { isDeepStrictEqual } = require('node:util');
const path = require('node:path');
const { implementation } = require('./configuration.cjs');

function requirePinnedImplementation(root = path.resolve(__dirname, '../../../../..'), pin = implementation) {
    assert.match(pin, /^[a-f0-9]{40}$/u, 'invalid implementation pin');
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    assert.equal(git('rev-parse', '--verify', pin + '^{commit}'), pin,
        'preregistered implementation commit unavailable');
    const source = ['src', 'pnpm-lock.yaml', 'tsconfig.json'];
    assert.equal(git('diff', '--no-ext-diff', '--no-textconv', '--name-only', pin, '--', ...source), '',
        'application source or lockfile does not match the preregistered implementation');
    assert.equal(git('diff', '--cached', '--no-ext-diff', '--no-textconv', '--name-only', pin, '--', ...source), '',
        'staged application source or lockfile differs from the preregistered implementation');
    assert.equal(git('ls-files', '--others', '--', ...source), '',
        'untracked application source or lockfile');
    return pin;
}

function requirePinnedRuntime(cli, runtime = require('./configuration.cjs').runtime) {
    assert.equal(typeof runtime?.codex, 'string', 'preregistered CLI version unavailable');
    assert.equal(cli, runtime.codex, 'CLI version differs from the preregistered runtime');
    return cli;
}

const qualificationDrivers = Object.freeze(['configuration.cjs', 'implementation.cjs', 'load.cjs', 'corpus.cjs',
    'review.cjs', 'full-review.cjs', 'launch-full-review.cjs', 'score-review.py']);

function requirePinnedDrivers(selected = require('./configuration.cjs')) {
    for (const file of qualificationDrivers) {
        const expected = selected.inspectedArtifacts?.[file];
        assert.match(expected ?? '', /^[a-f0-9]{64}$/u, 'preregistered driver hash unavailable: ' + file);
        assert.equal(createHash('sha256').update(readFileSync(path.join(__dirname, file))).digest('hex'), expected,
            'qualification driver differs from the preregistration: ' + file);
    }
    selectedPlanProvenance(undefined, selected);
}

function selectedPlanProvenance(file, selected = require('./configuration.cjs')) {
    file ??= process.env.COPILOT_EV07_PLAN ? path.resolve(process.env.COPILOT_EV07_PLAN) : path.join(__dirname, 'plan.json');
    const bytes = readFileSync(file);
    assert(isDeepStrictEqual(JSON.parse(bytes), selected), 'selected plan changed after configuration');
    requireQualificationPolicy(selected);
    assert(!lstatSync(file).isSymbolicLink(), 'preregistered plan must be a committed regular file');
    file = realpathSync(file);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    Object.assign(env, { GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1' });
    let directory = path.dirname(file);
    const git = (...args) => execFileSync('git', ['--no-pager', '--literal-pathspecs', '-C', directory,
        '-c', 'log.showSignature=false', '-c', 'core.fsmonitor=false', ...args],
    { env, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 });
    try {
        const text = (...args) => git(...args).toString('utf8').replace(/\r?\n$/u, '');
        const root = text('rev-parse', '--show-toplevel');
        const relative = path.relative(root, file).split(path.sep).join('/');
        assert(relative && !relative.split('/').some(part => ['..', '.git'].includes(part)) && !path.isAbsolute(relative));
        directory = root;
        const commit = text('log', '-1', '--format=%H', '--no-show-signature', 'HEAD', '--', relative);
        const rows = git('ls-tree', '-z', commit, '--', relative).toString('utf8').split('\0').filter(Boolean);
        assert.equal(rows.length, 1);
        const [header, name] = rows[0].split('\t');
        const [mode, type, blob] = header.split(' ');
        assert(['100644', '100755'].includes(mode) && type === 'blob' && name === relative);
        assert(git('cat-file', 'blob', blob).equals(bytes));
        return { commit, path: relative, blob, sha256: createHash('sha256').update(bytes).digest('hex') };
    } catch {
        throw new Error('selected plan provenance is not a matching committed regular file');
    }
}

function requireQualificationPolicy(selected) {
    const policy = readFileSync(path.join(__dirname, 'plan.json'));
    assert.equal(createHash('sha256').update(policy).digest('hex'),
        '572dfedf3db3975d9478a16222495b228494e5a3e321eaf1e5d108788edf8235', 'published qualification policy changed');
    const baseline = JSON.parse(policy);
    const actual = selected.repositoryCohort, required = baseline.repositoryCohort;
    assert(selected.schemaVersion === 1 && selected.mode === 'shadow' && selected.publication === 'dry-run'
        && selected.production === 'disabled', 'qualification policy must remain shadow, dry-run and disabled');
    assert.equal(actual?.manifestSha256, required.manifestSha256, 'qualification cohort provenance');
    assert.equal(actual?.oracleSha256, required.oracleSha256, 'qualification oracle provenance');
    assert.deepEqual([...(actual?.order ?? [])].sort(), [...required.order].sort(), 'qualification requires every paired subject once');
    assert.equal(actual.repetitions, required.repetitions, 'qualification requires three repetitions');
    assert.equal(actual.requireAllExactPositiveControls, true, 'qualification requires all positive controls');
    for (const field of ['baselineMinimumAlerts', 'baselineMinimumPremises', 'minimumStrictlyBetterRepetitions']) {
        assert(Number.isInteger(actual[field]) && actual[field] >= required[field], 'qualification floor: ' + field);
    }
    assert(Number.isFinite(actual.maximumAddedP95Ms) && actual.maximumAddedP95Ms >= 0
        && actual.maximumAddedP95Ms <= required.maximumAddedP95Ms, 'qualification latency criterion cannot be weakened');
    assert.equal(selected.corpus?.sha256, baseline.corpus.sha256, 'qualification independent corpus provenance');
    assert.equal(selected.corpus?.cases, baseline.corpus.cases, 'qualification requires all 174 independent cases');
    for (const [field, minimum] of Object.entries(baseline.corpus.gates)) {
        const value = selected.corpus.gates?.[field];
        assert(Number.isFinite(value) && value >= 0 && value <= 1
            && (field === 'maxBrier' ? value <= minimum : value >= minimum), 'qualification gate cannot be weakened: ' + field);
    }
}

function selectedPlanSha256() { return selectedPlanProvenance().sha256; }

module.exports = { requirePinnedImplementation, requirePinnedRuntime, requirePinnedDrivers, selectedPlanSha256, selectedPlanProvenance };

if (require.main === module) {
    assert.equal(process.argv[2], '--plan-provenance');
    process.stdout.write(JSON.stringify(selectedPlanProvenance()));
}
