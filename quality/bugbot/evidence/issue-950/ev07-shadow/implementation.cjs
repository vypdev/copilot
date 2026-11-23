'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync, lstatSync, realpathSync } = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const path = require('node:path');
const { implementation } = require('./configuration.cjs');

const { attestSource, attestRuntime, attestDrivers, pinnedGit, bootstrapOperation, selectedQualificationRuntime } = require('../execution-provenance.cjs');

function requirePinnedImplementation(root = path.resolve(__dirname, '../../../../..'), pin = implementation) {
    return attestSource(root, pin).implementation;
}

function qualificationProvenance(selected = require('./configuration.cjs')) {
    const root = path.resolve(__dirname, '../../../../..');
    const source = attestSource(root, selected.implementation);
    const drivers = requirePinnedDrivers(selected);
    const runtime = attestRuntime(root, selectedQualificationRuntime(root, selected));
    const admission = require('../execution-provenance.cjs').bootstrapAdmission(root);
    return { ...source, drivers, runtime, ...(admission && { bootstrap: admission }), ...(selected.containment && {
        executionContext: bootstrapOperation(root) ? 'worker' : 'host',
        workerRuntime: selected.runtime, containment: selected.containment,
    }) };
}

/** Expected tuple for independent artifact comparison; this does not claim
 * that a worker independently observed the host, or vice versa. */
function expectedQualificationContext(provenance, selected, context) {
    if (!selected.containment) return provenance;
    assert(['host', 'worker'].includes(context));
    const expected = context === 'host' ? selected.hostRuntime : selected.runtime;
    return { ...provenance, executionContext: context,
        runtime: Object.fromEntries(Object.keys(provenance.runtime).map(key => [key, expected[key]])) };
}

function requirePinnedRuntime(cli, runtime = require('./configuration.cjs').runtime) {
    assert.equal(typeof runtime?.codex, 'string', 'preregistered CLI version unavailable');
    assert.equal(cli, runtime.codex, 'CLI version differs from the preregistered runtime');
    return cli;
}

function requirePinnedExecution(execution, runtime = require('./configuration.cjs').runtime) {
    requirePinnedRuntime(execution.runtimeContract?.version, runtime);
    const digest = file => {
        assert(typeof file === 'string' && path.isAbsolute(file), 'runtime artifact must have an absolute path');
        assert(lstatSync(file).isFile(), 'runtime artifact must be a regular file');
        return createHash('sha256').update(readFileSync(file)).digest('hex');
    };
    const expected = runtime.executableSha256 ?? runtime.codexSha256;
    assert.match(expected ?? '', /^[a-f0-9]{64}$/u, 'preregistered executable digest unavailable');
    const executableSha256 = digest(execution.executable);
    assert.equal(executableSha256, expected, 'actual executable differs from the preregistered runtime digest');
    let nativeProof;
    assert(runtime.nativeExecutableSha256 === undefined || runtime.nativeExecutable !== undefined, 'native CLI digest has no executable');
    if (runtime.nativeExecutable !== undefined) {
        assert.match(runtime.nativeExecutableSha256 ?? '', /^[a-f0-9]{64}$/u, 'preregistered native CLI digest unavailable');
        const nativeExecutableSha256 = digest(runtime.nativeExecutable);
        assert.equal(nativeExecutableSha256, runtime.nativeExecutableSha256, 'actual native CLI differs before probes');
        nativeProof = { nativeExecutableSha256 };
    }
    const launcher = execution.launcherArgv ?? [];
    assert(launcher.length <= 1, 'unsupported qualification launcher');
    if (launcher.length) {
        assert.match(runtime.launcherSha256 ?? '', /^[a-f0-9]{64}$/u, 'preregistered launcher digest unavailable');
        const launcherSha256 = digest(launcher[0]);
        assert.equal(launcherSha256, runtime.launcherSha256, 'launcher differs from the preregistered runtime digest');
        assert.equal(execution.launcherSha256, launcherSha256, 'prepared launcher differs from admitted bytes');
        return { executableSha256, launcherSha256, ...nativeProof };
    }
    assert(!runtime.launcherSha256 && !execution.launcherSha256, 'declared launcher is missing');
    return { executableSha256, ...nativeProof };
}

function requirePinnedCliProbe(runtime = require('./configuration.cjs').runtime) {
    const launcher = runtime?.launcher ? [runtime.launcher] : [];
    const execution = { executable: runtime?.executable, launcherArgv: launcher,
        ...(launcher.length && { launcherSha256: runtime.launcherSha256 }),
        runtimeContract: { version: runtime?.codex } };
    const proof = requirePinnedExecution(execution, runtime);
    // Never resolve through PATH, or run even --version before byte admission.
    const version = execFileSync(execution.executable, [...launcher, '--version'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: path.dirname(process.execPath) + path.delimiter + '/usr/bin:/bin' }, timeout: 15_000, killSignal: 'SIGKILL',
    }).trim();
    requirePinnedRuntime(version, runtime);
    return { version, proof };
}

function preparePinnedExecution(planner, request, runtime = require('./configuration.cjs').runtime,
    lifecycle = require('./configuration.cjs').lifecycle) {
    // The ordinary planner probes the selected CLI before returning its plan.
    // Resolve through its production helpers and admit those bytes first;
    // then retain the ordinary planner and its post-preparation proof unchanged.
    const root = path.resolve(__dirname, '../../../../..');
    const { resolveAgentExecutablePath, validateResolvedAgentInvocation } = require(path.join(root,
        'src/infrastructure/agents/agent_executable_invocation'));
    const { getAgentRuntimeManifestEntry } = require(path.join(root, 'src/infrastructure/agents/agent_runtime_manifest'));
    const { provider } = request.configuration, environment = request.environment ?? process.env;
    const selected = request.configuration.executable?.trim() || getAgentRuntimeManifestEntry(provider).executable;
    const executable = resolveAgentExecutablePath(selected, environment);
    const invocation = validateResolvedAgentInvocation(executable, provider, environment);
    const launcherArgv = invocation.prefixArgs;
    requirePinnedExecution({ executable: invocation.executable, launcherArgv,
        ...(launcherArgv.length && { launcherSha256: createHash('sha256').update(readFileSync(launcherArgv[0])).digest('hex') }),
        runtimeContract: { version: runtime?.codex } }, runtime);
    return lifecycle === 'qualification-investigation-v1'
        ? planner.prepareQualificationInvestigation(request) : planner.prepare(request);
}

const qualificationDrivers = Object.freeze(['configuration.cjs', 'implementation.cjs', 'load.cjs', 'corpus.cjs',
    'review.cjs', 'full-review.cjs', 'launch-full-review.cjs', 'score-review.py', '../execution-provenance.cjs', '../qualification-bootstrap.cjs']);

function selectedQualificationDrivers(selected) {
    return selected.schemaVersion === 2 ? [...qualificationDrivers,
        '../../issue974/corpus-selection.cjs', '../../issue974/attempt-ledger.cjs', ...(selected.containment
            ? ['operation-containment.cjs', 'qualification-seccomp.cjs', 'qualification-supervisor.cjs', 'qualification-runtime.Dockerfile', 'qualification-requirements.toml', 'containment-native-fixture.cjs', 'sdk-runtime-admission.cjs']
                .map(name => '../../issue974/' + name) : [])] : qualificationDrivers;
}

function requirePinnedDrivers(selected = require('./configuration.cjs')) {
    const drivers = attestDrivers(__dirname, selected.inspectedArtifacts, selectedQualificationDrivers(selected));
    selectedPlanProvenance(undefined, selected);
    return drivers;
}

function selectedPlanProvenance(file, selected = require('./configuration.cjs')) {
    file ??= process.env.COPILOT_EV07_PLAN ? path.resolve(process.env.COPILOT_EV07_PLAN) : path.join(__dirname, 'plan.json');
    const bytes = readFileSync(file);
    assert(isDeepStrictEqual(JSON.parse(bytes), selected), 'selected plan changed after configuration');
    requireQualificationPolicy(selected);
    assert(!lstatSync(file).isSymbolicLink(), 'preregistered plan must be a committed regular file');
    file = realpathSync(file);
    let directory = path.dirname(file);
    while (!require('node:fs').existsSync(path.join(directory, '.git')) && path.dirname(directory) !== directory) {
        directory = path.dirname(directory);
    }
    try {
        const git = pinnedGit(directory);
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
    assert([1, 2].includes(selected.schemaVersion) && selected.mode === 'shadow' && selected.publication === 'dry-run'
        && selected.production === 'disabled', 'qualification policy must remain shadow, dry-run and disabled');
    assert(selected.schemaVersion !== 2 || selected.containment, 'schema v2 requires contained dispatch');
    if (selected.containment) {
        assert.equal(selected.schemaVersion, 2);
        assert.equal(selected.lifecycle, 'qualification-investigation-v1');
        assert.match(selected.containment.image ?? '', /^sha256:[a-f0-9]{64}$/u);
        for (const runtime of [selected.hostRuntime, selected.runtime]) {
            assert(runtime, 'both host and worker runtime closures are required');
            for (const field of ['nodeSha256', 'gitSha256', 'typescriptSha256', 'dependencyTreeSha256']) {
                assert.match(runtime[field] ?? '', /^[a-f0-9]{64}$/u, 'runtime byte identity is missing: ' + field);
            }
        }
        if (selected.runtime.launcher) {
            assert(path.isAbsolute(selected.runtime.nativeExecutable ?? ''), 'launcher must pin the actual native CLI');
            assert.match(selected.runtime.nativeExecutableSha256 ?? '', /^[a-f0-9]{64}$/u);
        }
    }
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
    if (selected.schemaVersion === 2) {
        require('../../issue974/corpus-selection.cjs').requireCorpusSelection(selected);
        assert.deepEqual(selected.detector, { provider: 'codex', modelProvider: 'openai', model: 'gpt-6-luna', effort: 'xhigh' },
            'v2 detector profile cannot substitute a model');
        assert.deepEqual(selected.verifier, { provider: 'codex', modelProvider: 'openai', model: 'gpt-6.1-sol', effort: 'xhigh' },
            'v2 paired verifier profile differs');
        assert.deepEqual(actual.order, required.order, 'v2 preserves fixed paired subject order');
    } else {
        assert.equal(selected.lifecycle, undefined, 'v1 cannot select the new investigation lifecycle');
        assert.equal(selected.corpus?.sha256, baseline.corpus.sha256, 'qualification independent corpus provenance');
    }
    assert.equal(selected.corpus?.cases, baseline.corpus.cases, 'qualification requires all 174 independent cases');
    for (const [field, minimum] of Object.entries(baseline.corpus.gates)) {
        const value = selected.corpus.gates?.[field];
        assert(Number.isFinite(value) && value >= 0 && value <= 1
            && (field === 'maxBrier' ? value <= minimum : value >= minimum), 'qualification gate cannot be weakened: ' + field);
    }
}

function selectedPlanSha256() { return selectedPlanProvenance().sha256; }

module.exports = { requirePinnedImplementation, requirePinnedRuntime, requirePinnedExecution, requirePinnedCliProbe,
    preparePinnedExecution, requirePinnedDrivers, qualificationProvenance, qualificationDrivers, selectedQualificationDrivers,
    requireQualificationPolicy, selectedPlanSha256, selectedPlanProvenance, expectedQualificationContext };

if (require.main === module) {
    assert.equal(process.argv[2], '--plan-provenance');
    process.stdout.write(JSON.stringify(selectedPlanProvenance()));
}
