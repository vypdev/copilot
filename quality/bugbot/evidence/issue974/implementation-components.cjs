'use strict';
// Actual private Git/plan/artifact bytes and version-only local child processes.
// Runtime-attestor/planner ports are modeled only where explicitly noted.
// Synthetic plans/proofs here never admit a native runtime or model campaign.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const os = require('node:os'), vm = require('node:vm'), cp = require('node:child_process');
const { createHash } = require('node:crypto'), { test } = require('node:test');
const root = path.resolve(__dirname, '../../../..');
const ev07 = path.join(root, 'quality/bugbot/evidence/issue-950/ev07-shadow');
const file = path.join(ev07, 'implementation.cjs'), source = fs.readFileSync(file, 'utf8');
const proof = require(path.join(ev07, '../execution-provenance.cjs'));
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const actualHead = proof.pinnedGit(root)('rev-parse', 'HEAD').toString().trim();
const base = JSON.parse(fs.readFileSync(path.join(ev07, 'plan.json')));

function fixture(t, options = {}) {
    const contained = options.contained !== false;
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-implementation-component-')));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const git = (...args) => cp.execFileSync(proof.trustedGitExecutable(), ['--literal-pathspecs',
        '-c', 'core.hooksPath=' + os.devNull, '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-C', directory, ...args], {
        env: { ...proof.gitEnvironment(), GIT_AUTHOR_NAME: 'Component', GIT_AUTHOR_EMAIL: 'component@example.invalid',
            GIT_COMMITTER_NAME: 'Component', GIT_COMMITTER_EMAIL: 'component@example.invalid' }, encoding: 'utf8' }).trim();
    git('init', '--quiet', '--template=');
    const marker = path.join(directory, 'probe.json'), launcher = path.join(directory, 'launcher.cjs');
    fs.writeFileSync(launcher, `const fs=require('node:fs'); if(JSON.stringify(process.argv.slice(2))!==JSON.stringify(['--version']))throw Error('Unexpected component probe'); fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({args:process.argv.slice(2),env:process.env})); console.log(${JSON.stringify(options.foreignVersion ? 'foreign-cli' : 'component-cli')});\n`);
    const native = path.join(directory, 'native-bytes'); fs.writeFileSync(native, 'component native bytes, never executed');
    const runtime = { codex: 'component-cli', executable: process.execPath, executableSha256: hash(fs.readFileSync(process.execPath)),
        launcher, launcherSha256: hash(fs.readFileSync(launcher)), nativeExecutable: native,
        nativeExecutableSha256: hash(fs.readFileSync(native)) };
    const selected = { ...clone(base), schemaVersion: contained ? 2 : 1,
        ...(contained ? { lifecycle: 'qualification-investigation-v1' } : {}), implementation: actualHead,
        corpus: contained ? { ...clone(base.corpus), path: 'quality/bugbot/corpus.v2.json', version: 2,
            sha256: hash(fs.readFileSync(path.join(root, 'quality/bugbot/corpus.v2.json'))) } : clone(base.corpus),
        detector: { provider: 'codex', modelProvider: 'openai', model: 'gpt-6-luna', effort: 'xhigh' },
        verifier: { provider: 'codex', modelProvider: 'openai', model: 'gpt-6.1-sol', effort: 'xhigh' }, runtime };
    const relative = options.literalName ? ':(glob)* plan.json' : 'inputs/plan.json';
    const planFile = path.join(directory, relative); fs.mkdirSync(path.dirname(planFile), { recursive: true });
    const events = [], planned = [], opaqueRuntime = { nodeSha256: 'a'.repeat(64), gitSha256: 'b'.repeat(64) };
    const state = { admission: undefined, operation: undefined, request: undefined };
    const ports = {
        './configuration.cjs': selected,
        'node:child_process': { ...cp, execFileSync(executable, args, settings) {
            events.push({ kind: 'version-probe', executable, args, settings });
            return cp.execFileSync(executable, args, settings);
        } },
        '../execution-provenance.cjs': { ...proof,
            // Projection controls replace only the runtime observation boundary.
            attestRuntime(_root, chosen) { events.push({ kind: 'runtime-attestor', chosen });
                return Object.fromEntries(Object.keys(opaqueRuntime).map(key => [key, chosen[key] ?? opaqueRuntime[key]])); },
            selectedQualificationRuntime(_root, chosen) { return state.operation ? chosen.runtime : chosen.hostRuntime ?? chosen.runtime; },
            bootstrapAdmission() { return state.admission; }, bootstrapOperation() { return state.operation; } },
        [path.join(root, 'src/infrastructure/agents/agent_executable_invocation')]: {
            resolveAgentExecutablePath(candidate, environment) { events.push({ kind: 'resolve', candidate, environment }); return runtime.executable; },
            validateResolvedAgentInvocation(executable, provider, environment) {
                events.push({ kind: 'invocation', executable, provider, environment });
                return { executable, prefixArgs: runtime.launcher ? [runtime.launcher] : [] };
            } },
        [path.join(root, 'src/infrastructure/agents/agent_runtime_manifest')]: {
            getAgentRuntimeManifestEntry(provider) { events.push({ kind: 'manifest', provider }); return { executable: 'component-manifest-cli' }; } },
    };
    const module = { exports: {} }, stdout = [];
    const processPort = { execPath: process.execPath, env: { COPILOT_EV07_PLAN: planFile, COMPONENT_PRIVATE_INPUT: 'must-not-reach-the-version-child' },
        argv: ['node', file, options.badEntry ? 'foreign-entry' : '--plan-provenance'], stdout: { write: text => stdout.push(text) } };
    const controlledRequire = name => Object.hasOwn(ports, name) ? ports[name]
        : name.startsWith('node:') ? require(name)
        : name.startsWith('.') ? require(path.resolve(ev07, name))
        : (() => { throw Error('Unplanned implementation component dependency ' + name); })();
    if (options.direct) controlledRequire.main = module;
    const load = () => vm.compileFunction(source, ['require', 'module', '__filename', '__dirname', 'process'], { filename: file })
        (controlledRequire, module, file, ev07, processPort);
    if (!options.direct) load();
    const api = module.exports;
    if (contained) {
        selected.containment = { image: 'sha256:' + 'd'.repeat(64) };
        selected.hostRuntime = { ...opaqueRuntime, typescriptSha256: 'c'.repeat(64), dependencyTreeSha256: 'd'.repeat(64) };
        Object.assign(selected.runtime, { nodeSha256: 'e'.repeat(64), gitSha256: 'f'.repeat(64),
            typescriptSha256: '1'.repeat(64), dependencyTreeSha256: '2'.repeat(64) });
    }
    const drivers = api.selectedQualificationDrivers ? api.selectedQualificationDrivers(selected)
        : [...require(path.join(ev07, 'implementation.cjs')).selectedQualificationDrivers(selected)];
    selected.inspectedArtifacts = Object.fromEntries(drivers.map(name => [name, hash(fs.readFileSync(path.join(ev07, name)))]));
    const save = () => fs.writeFileSync(planFile, JSON.stringify(selected));
    save(); if (options.executablePlan) fs.chmodSync(planFile, 0o755);
    git('add', '--', relative); git('commit', '--quiet', '-m', 'Synthetic component preregistration only');
    const commit = git('rev-parse', 'HEAD');
    const execution = () => ({ executable: runtime.executable, launcherArgv: runtime.launcher ? [runtime.launcher] : [],
        ...(runtime.launcher && { launcherSha256: runtime.launcherSha256 }), runtimeContract: { version: runtime.codex } });
    const planner = { prepare(request) { planned.push({ mode: 'ordinary', request }); return 'ordinary-plan'; },
        prepareQualificationInvestigation(request) { planned.push({ mode: 'investigation', request }); return 'investigation-plan'; } };
    return { directory, git, selected, runtime, planFile, relative, marker, native, launcher, api, state, opaqueRuntime,
        events, planned, planner, execution, save, load, stdout, commit, processPort };
}

test('implementation component: source admission binds the actual clean host source to its exact current commit', t => {
    const f = fixture(t);
    assert.equal(f.api.requirePinnedImplementation(root, actualHead), actualHead);
    assert.equal(f.api.requirePinnedImplementation(), actualHead);
    assert.throws(() => f.api.requirePinnedImplementation(root, 'not-a-commit'));
    assert(!fs.existsSync(f.marker));
});

for (const mode of ['plain', 'host', 'worker']) test('implementation component: provenance keeps ' + mode + ' observation separate from expected context', t => {
    const f = fixture(t, { contained: mode !== 'plain' });
    if (mode !== 'plain') f.state.admission = { componentOnly: true };
    if (mode === 'worker') f.state.operation = { componentOnly: true };
    const actual = f.api.qualificationProvenance();
    const observed = mode === 'worker' ? f.selected.runtime : f.selected.hostRuntime ?? f.opaqueRuntime;
    assert.equal(actual.implementation, actualHead);
    assert.deepEqual(actual.runtime, Object.fromEntries(Object.keys(f.opaqueRuntime).map(key => [key, observed[key]])));
    assert.deepEqual(actual.drivers, f.selected.inspectedArtifacts);
    if (mode === 'plain') { assert(!('executionContext' in actual)); assert(!('bootstrap' in actual)); }
    else { assert.equal(actual.executionContext, mode); assert.deepEqual(actual.bootstrap, f.state.admission); }
    const expected = f.api.expectedQualificationContext(actual, f.selected, mode === 'worker' ? 'host' : 'worker');
    if (mode === 'plain') assert.equal(expected, actual);
    else {
        const chosen = mode === 'worker' ? f.selected.hostRuntime : f.selected.runtime;
        assert.deepEqual(expected.runtime, Object.fromEntries(Object.keys(actual.runtime).map(key => [key, chosen[key]])));
        assert.notDeepEqual(expected.runtime, actual.runtime);
        assert.equal(expected.executionContext, mode === 'worker' ? 'host' : 'worker');
        assert.throws(() => f.api.expectedQualificationContext(actual, f.selected, 'foreign'));
    }
    assert(!fs.existsSync(f.marker));
});

for (const options of [{}, { literalName: true }, { executablePlan: true }]) test('implementation component: exact committed plan and driver bytes bind ' + JSON.stringify(options), t => {
    const f = fixture(t, options);
    const record = f.api.selectedPlanProvenance();
    assert.equal(record.commit, f.commit); assert.equal(record.path, f.relative);
    assert.equal(record.sha256, hash(fs.readFileSync(f.planFile)));
    assert.equal(record.blob, f.git('rev-parse', f.commit + ':' + f.relative));
    assert.equal(f.api.selectedPlanSha256(), record.sha256);
    assert.deepEqual(f.api.requirePinnedDrivers(), f.selected.inspectedArtifacts);
    assert(!fs.existsSync(f.marker));
});

test('implementation component: historical committed plan data does not admit changed current source', () => {
    const module = { exports: {} }, actualRequire = require('node:module').createRequire(file);
    const controlledRequire = name => name === './configuration.cjs' ? clone(base) : actualRequire(name);
    vm.compileFunction(source, ['require', 'module', '__filename', '__dirname', 'process'], { filename: file })
        (controlledRequire, module, file, ev07, { env: {}, execPath: process.execPath });
    const record = module.exports.selectedPlanProvenance();
    assert.equal(record.sha256, hash(fs.readFileSync(path.join(ev07, 'plan.json'))));
    assert.equal(module.exports.selectedPlanSha256(), record.sha256);
    assert.throws(() => module.exports.requirePinnedImplementation());
});

for (const kind of ['changed-object', 'changed-after-commit', 'uncommitted', 'symlink', 'outside-repository']) {
    test('implementation component: refuses ' + kind + ' plan data without a version probe', t => {
        const f = fixture(t); let file = f.planFile, selected = f.selected;
        if (kind === 'changed-object') selected = { ...f.selected, implementation: 'f'.repeat(40) };
        if (kind === 'changed-after-commit') { f.selected.implementation = 'f'.repeat(40); f.save(); }
        if (kind === 'uncommitted') { file = path.join(f.directory, 'uncommitted.json'); fs.copyFileSync(f.planFile, file); }
        if (kind === 'symlink') { file = path.join(f.directory, 'link.json'); fs.symlinkSync(f.planFile, file); }
        if (kind === 'outside-repository') {
            const separate = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-outside-plan-')));
            t.after(() => fs.rmSync(separate, { recursive: true, force: true })); file = path.join(separate, 'plan.json'); fs.copyFileSync(f.planFile, file);
        }
        assert.throws(() => f.api.selectedPlanProvenance(file, selected)); assert(!fs.existsSync(f.marker));
    });
}

test('implementation component: version-only child is byte-admitted and receives a credential-free environment', t => {
    const f = fixture(t); const observed = f.api.requirePinnedCliProbe();
    assert.equal(observed.version, 'component-cli'); assert.equal(observed.proof.executableSha256, f.runtime.executableSha256);
    assert.equal(observed.proof.nativeExecutableSha256, f.runtime.nativeExecutableSha256);
    const probe = JSON.parse(fs.readFileSync(f.marker)); assert.deepEqual(probe.args, ['--version']);
    const dispatched = f.events.find(row => row.kind === 'version-probe');
    assert.deepEqual(dispatched.settings.env, { PATH: path.dirname(process.execPath) + path.delimiter + '/usr/bin:/bin' });
    assert.equal(Object.hasOwn(probe.env, 'COMPONENT_PRIVATE_INPUT'), false);
    // macOS may inject __CF_USER_TEXT_ENCODING after exec. Assert the exact
    // credential-free dispatch environment above, rather than OS-owned keys.
});

for (const kind of ['executable-hash', 'native-hash', 'native-path-missing', 'launcher-hash', 'launcher-proof', 'extra-launcher', 'relative-executable', 'directory']) {
    test('implementation component: refuses ' + kind + ' before any CLI process', t => {
        const f = fixture(t), execution = f.execution();
        if (kind === 'executable-hash') f.runtime.executableSha256 = 'f'.repeat(64);
        if (kind === 'native-hash') f.runtime.nativeExecutableSha256 = 'f'.repeat(64);
        if (kind === 'native-path-missing') delete f.runtime.nativeExecutable;
        if (kind === 'launcher-hash') f.runtime.launcherSha256 = 'f'.repeat(64);
        if (kind === 'launcher-proof') execution.launcherSha256 = 'f'.repeat(64);
        if (kind === 'extra-launcher') execution.launcherArgv.push(f.launcher);
        if (kind === 'relative-executable') execution.executable = 'node';
        if (kind === 'directory') execution.executable = f.directory;
        assert.throws(() => f.api.requirePinnedExecution(execution)); assert(!fs.existsSync(f.marker));
    });
}

test('implementation component: admits exact bare executable bytes and refuses a declared missing launcher', t => {
    const f = fixture(t); delete f.runtime.launcher; delete f.runtime.launcherSha256;
    assert.deepEqual(f.api.requirePinnedExecution(f.execution()), { executableSha256: f.runtime.executableSha256,
        nativeExecutableSha256: f.runtime.nativeExecutableSha256 });
    f.runtime.launcherSha256 = 'a'.repeat(64); assert.throws(() => f.api.requirePinnedExecution(f.execution()));
    assert(!fs.existsSync(f.marker));
});

test('implementation component: legacy digest compatibility cannot override a wrong primary executable pin', t => {
    const f = fixture(t), expected = f.runtime.executableSha256;
    delete f.runtime.executableSha256; f.runtime.codexSha256 = expected;
    delete f.runtime.launcher; delete f.runtime.launcherSha256;
    delete f.runtime.nativeExecutable; delete f.runtime.nativeExecutableSha256;
    assert.deepEqual(f.api.requirePinnedExecution(f.execution()), { executableSha256: expected });
    f.runtime.executableSha256 = 'f'.repeat(64);
    assert.throws(() => f.api.requirePinnedExecution(f.execution()), /actual executable differs/);
    delete f.runtime.executableSha256; delete f.runtime.codexSha256;
    assert.throws(() => f.api.requirePinnedExecution(f.execution()), /digest unavailable/);
    assert(!fs.existsSync(f.marker));
});

test('implementation component: changed version is rejected only after a single admitted version probe', t => {
    const f = fixture(t, { foreignVersion: true }); assert.throws(() => f.api.requirePinnedCliProbe(), /CLI version/);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.marker)).args, ['--version']);
    assert.throws(() => f.api.requirePinnedRuntime('component-cli', {}), /unavailable/);
});

for (const mode of ['investigation', 'ordinary', 'manifest-fallback']) test('implementation component: ' + mode + ' planner follows byte admission', t => {
    const f = fixture(t), request = { configuration: { provider: 'codex', executable: mode === 'manifest-fallback' ? ' ' : '  component-cli  ' },
        ...(mode !== 'manifest-fallback' && { environment: { PATH: 'component-search-path' } }) };
    const actual = f.api.preparePinnedExecution(f.planner, request, undefined, mode === 'investigation' ? undefined : 'legacy');
    assert.equal(actual, mode === 'investigation' ? 'investigation-plan' : 'ordinary-plan');
    assert.equal(f.planned.length, 1); assert.equal(f.planned[0].request, request);
    assert.equal(f.events.find(row => row.kind === 'resolve').candidate, mode === 'manifest-fallback' ? 'component-manifest-cli' : 'component-cli');
    assert(!fs.existsSync(f.marker));
});

test('implementation component: an invalid pre-probe pin starts neither planner path', t => {
    const f = fixture(t); f.runtime.executableSha256 = 'f'.repeat(64);
    assert.throws(() => f.api.preparePinnedExecution(f.planner, { configuration: { provider: 'codex' } }));
    assert.deepEqual(f.planned, []); assert(!fs.existsSync(f.marker));
});

for (const kind of ['missing-containment', 'null-containment', 'false-containment', 'missing-host', 'bad-runtime-hash', 'missing-runtime-hash', 'missing-native', 'missing-native-hash',
    'bad-image', 'missing-image', 'schema-v1-contained', 'missing-cohort', 'missing-order']) {
    test('implementation component: contained policy rejects ' + kind + ' without process admission', t => {
        const f = fixture(t, { contained: true }); f.api.requireQualificationPolicy(f.selected);
        if (kind === 'missing-containment') delete f.selected.containment;
        if (kind === 'null-containment') f.selected.containment = null;
        if (kind === 'false-containment') f.selected.containment = false;
        if (kind === 'missing-host') delete f.selected.hostRuntime;
        if (kind === 'bad-runtime-hash') f.selected.runtime.nodeSha256 = 'wrong';
        if (kind === 'missing-runtime-hash') delete f.selected.runtime.nodeSha256;
        if (kind === 'missing-native') delete f.selected.runtime.nativeExecutable;
        if (kind === 'missing-native-hash') delete f.selected.runtime.nativeExecutableSha256;
        if (kind === 'bad-image') f.selected.containment.image = 'mutable:tag';
        if (kind === 'missing-image') delete f.selected.containment.image;
        if (kind === 'schema-v1-contained') f.selected.schemaVersion = 1;
        if (kind === 'missing-cohort') delete f.selected.repositoryCohort;
        if (kind === 'missing-order') delete f.selected.repositoryCohort.order;
        assert.throws(() => f.api.requireQualificationPolicy(f.selected)); assert(!fs.existsSync(f.marker));
    });
}

for (const badEntry of [false, true]) test('implementation component: standalone provenance entry bad=' + badEntry, t => {
    const f = fixture(t, { direct: true, badEntry });
    if (badEntry) { assert.throws(f.load); assert.deepEqual(f.stdout, []); }
    else { f.load(); assert.equal(JSON.parse(f.stdout.join('')).commit, f.commit); }
    assert(!fs.existsSync(f.marker));
});
