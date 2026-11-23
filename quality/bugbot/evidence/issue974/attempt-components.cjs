'use strict';
// Actual recorder/artifact/admission code, with modeled CLI/verifier transports.
// These controls execute no provider, native CLI or qualification campaign.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createHash } = require('node:crypto'), { test } = require('node:test');
const root = path.resolve(__dirname, '../../../..');
const { createDurableRecorder, createRecordedCli, createRecordedVerifier, validateCompleteAttempts,
    validateCompleteReviewAttempts, boundedFailure } = require(path.join(root, 'quality/bugbot/evidence/issue974/attempt-ledger.cjs'));
const hash = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(t, options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ev974-attempt-component-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const artifacts = path.join(directory, 'detector'), verifiers = path.join(directory, 'verifier'); fs.mkdirSync(artifacts); fs.mkdirSync(verifiers);
    const selected = { detector: { provider: 'codex', model: 'component-detector', modelProvider: 'component-provider', effort: 'xhigh' },
        verifier: { model: 'component-verifier', modelProvider: 'component-provider', effort: 'xhigh' },
        runtime: { codex: 'component-cli', [options.legacy ? 'codexSha256' : 'executableSha256']: 'a'.repeat(64),
            ...(options.completeRuntime ? { launcherSha256: 'b'.repeat(64), nativeExecutableSha256: 'c'.repeat(64) } : {}) } };
    const runtime = () => ({ executableSha256: selected.runtime.executableSha256 ?? selected.runtime.codexSha256,
        ...(selected.runtime.launcherSha256 ? { launcherSha256: selected.runtime.launcherSha256 } : {}),
        ...(selected.runtime.nativeExecutableSha256 ? { nativeExecutableSha256: selected.runtime.nativeExecutableSha256 } : {}) });
    const controller = new AbortController(), rows = [], durable = createDurableRecorder(path.join(directory, 'attempts.jsonl'));
    const record = row => { if (options.observerFailure && row.event === 'attempt-observation') throw options.observerFailure;
        if (options.preparedWriteFailure && row.event === 'attempt-prepared') throw options.preparedWriteFailure;
        durable(row); rows.push(row); };
    const flags = config => ({ model: config.model, modelProvider: config.modelProvider, reasoningEffort: config.effort, sandbox: 'read-only' });
    const request = { prompt: 'component-only delivered prompt', outputSchema: { type: 'object', properties: {}, additionalProperties: false },
        configuration: selected.detector, signal: controller.signal };
    const cli = createRecordedCli({ caseId: 'component-case', record, artifactDirectory: artifacts,
        cancellation: { signal: controller.signal, abort: () => controller.abort() },
        recordObservation: options.auxiliaryObserverFailure ? () => { throw options.auxiliaryObserverFailure; } : undefined,
        createClient: (observer, prepared) => ({ async execute(input) {
            if (options.preparationFailure) throw options.preparationFailure;
            observer.observe({ provider: 'codex', capability: 'findings', state: 'started', phase: 'plan' });
            const schema = hash(JSON.stringify(input.outputSchema ?? null));
            prepared({ flags: flags(selected.detector), runtimeProof: runtime(), runtimeContract: { version: selected.runtime.codex },
                workspaceMode: 'read-only', output: 'native-and-local-json-schema', qualificationInvestigation: true, schemaArtifactSha256: schema });
            observer.observe({ provider: 'codex', capability: 'findings', state: 'admitted', phase: 'preflight', workspaceMode: 'read-only',
                version: selected.runtime.codex, outputContract: 'native-and-local-json-schema', artifactHashes: [schema] });
            observer.observe({ provider: 'codex', capability: 'findings', state: 'completed', phase: 'run', outputBytes: Buffer.byteLength('é') });
            return 'é';
        } }) });
    const validate = (records = rows, cases = [{ id: 'component-case', attemptIds: cli.attemptIds }]) =>
        validateCompleteAttempts(records, cases, selected, artifacts);
    const turns = [];
    const verifier = createRecordedVerifier({ caseId: 'component-case', record, artifactDirectory: verifiers, admitRuntime: runtime,
        async transport(input) {
            input.onRuntimeAdmission({ componentOnly: true }); input.onInvocation(flags(selected.verifier));
            if (options.termination !== undefined) input.onTermination(options.termination);
            if (options.abortVerifier) controller.abort();
            if (options.verifierFailure) throw options.verifierFailure;
            const fact = { failure: options.factFailure ?? null, resolvedModel: selected.verifier.model,
                invocation: flags(selected.verifier), promptSha256: hash(input.prompt), schemaSha256: hash(JSON.stringify(input.schema)) };
            turns.push(fact); return { fact, response: { componentOnly: true } };
        } });
    const verifyRequest = { configuration: selected.verifier, prompt: 'component verifier input', schema: { type: 'object' },
        candidateId: 'candidate-one', signal: controller.signal };
    const result = () => ({ event: 'result', payload: { bugbotShadowVerification: { candidates: [{ id: 'candidate-one', investigation: { turns } }] } } });
    const validateReview = () => validateCompleteReviewAttempts({ records: [...rows, result()], caseId: 'component-case', selected,
        detectorDirectory: artifacts, verifierDirectory: verifiers });
    return { directory, artifacts, verifiers, rows, selected, request, verifyRequest, controller, cli, verifier, validate, validateReview };
}

test('attempt ledger component preserves finite process exit status without private error payload', () => {
    assert.deepEqual(boundedFailure({ category: 'process', retryable: true, exitCode: 137, message: 'PRIVATE_PAYLOAD' }),
        { category: 'process', retryable: true, exitCode: 137 });
    for (const exitCode of [NaN, Infinity, 1.5]) assert.deepEqual(boundedFailure({ exitCode }), { category: 'unknown', retryable: false });
});

test('attempt ledger component durably records a missing schema before preparation rejects it', async t => {
    const failure = { category: 'configuration', exitCode: 2 }, f = fixture(t, { preparationFailure: failure });
    delete f.request.outputSchema;
    await assert.rejects(f.cli.execute(f.request), error => error === failure);
    const start = f.rows[0], delivered = JSON.parse(fs.readFileSync(path.join(f.artifacts, start.requestFile)));
    assert.equal(delivered.outputSchema, null); assert.equal(start.schemaSha256, hash('null'));
    assert.equal(f.rows.at(-1).status, 'failed'); assert.equal(f.rows.at(-1).failure.exitCode, 2);
    assert.throws(() => f.validate());
});

test('attempt ledger component a successful CLI return cannot conceal failed observation persistence', async t => {
    const failure = new Error('controlled observation write failure'), f = fixture(t, { observerFailure: failure });
    await assert.rejects(f.cli.execute(f.request), error => error === failure);
    assert.equal(f.rows.at(-1).status, 'failed'); assert.equal(f.rows.at(-1).observationIncomplete, true);
    assert(!fs.readdirSync(f.artifacts).some(name => name.endsWith('.response.txt'))); assert.throws(() => f.validate());
});

test('attempt ledger component requires its original cancellation signal before artifacts or client creation', async t => {
    const f = fixture(t);
    for (const cancellation of [undefined, { signal: f.controller.signal }]) {
        assert.throws(() => createRecordedCli({ cancellation }), /requires owned cancellation/);
    }
    await assert.rejects(f.cli.execute({ ...f.request, signal: new AbortController().signal }), /exact request signal/);
    assert.equal(f.controller.signal.aborted, false);
    assert.equal(f.rows.length, 0); assert.equal(f.cli.attemptIds.length, 0);
    assert.deepEqual(fs.readdirSync(f.artifacts), []);
});

test('attempt ledger component preparation evidence failure aborts before an admitted observation', async t => {
    const failure = new Error('controlled preparation record failure'), f = fixture(t, { preparedWriteFailure: failure });
    await assert.rejects(f.cli.execute(f.request), error => error === failure);
    assert.equal(f.controller.signal.aborted, true);
    assert.deepEqual(f.rows.filter(row => row.event === 'attempt-observation').map(row => row.fact.state), ['started']);
    assert.equal(f.rows.at(-1).status, 'failed'); assert.equal(f.rows.at(-1).observationIncomplete, true);
    assert(!fs.readdirSync(f.artifacts).some(name => name.endsWith('.response.txt')));
});

test('attempt ledger component review-specific observation writes share the pre-dispatch abort fence', async t => {
    const failure = new Error('controlled auxiliary observation failure'), f = fixture(t, { auxiliaryObserverFailure: failure });
    await assert.rejects(f.cli.execute(f.request), error => error === failure);
    assert.equal(f.controller.signal.aborted, true);
    assert.equal(f.rows.some(row => row.event === 'attempt-prepared'), false);
    assert.equal(f.rows.at(-1).status, 'failed'); assert.equal(f.rows.at(-1).observationIncomplete, true);
});

test('attempt ledger component preserves the first observation failure through later SDK and terminal write failures', async t => {
    const f = fixture(t), first = new Error('first controlled evidence failure'), later = new Error('later controlled failure');
    let observations = 0, aborts = 0;
    const record = createDurableRecorder(path.join(f.directory, 'first-error.jsonl'));
    const cli = createRecordedCli({ caseId: 'first-error', artifactDirectory: f.artifacts,
        cancellation: { signal: f.controller.signal, abort() { aborts++; f.controller.abort(); } },
        record(row) {
            if (row.event === 'attempt-observation') throw ++observations === 1 ? first : later;
            if (row.event === 'attempt-finish') throw later;
            record(row);
        },
        createClient: observer => ({ async execute() {
            observer.observe({ state: 'started', phase: 'plan' });
            observer.observe({ state: 'failed', phase: 'preflight' });
            throw later;
        } }),
    });
    await assert.rejects(cli.execute(f.request), error => error === first);
    assert.equal(observations, 2); assert.equal(aborts, 1); assert.equal(f.controller.signal.aborted, true);
    assert(!fs.readdirSync(f.artifacts).some(name => name.endsWith('.response.txt')));
});

test('attempt ledger component cannot invent absent case-attempt accounting', async t => {
    const f = fixture(t); await f.cli.execute(f.request);
    assert.throws(() => f.validate(f.rows, [{ id: 'component-case' }]), /accounting/);
});

test('attempt ledger component requires an actual delivered schema artifact identity', async t => {
    const f = fixture(t); await f.cli.execute(f.request); const records = copy(f.rows);
    delete records.find(row => row.event === 'attempt-prepared').prepared.schemaArtifactSha256;
    assert.throws(() => f.validate(records));
});

for (const legacy of [false, true]) for (const completeRuntime of [false, true]) {
    test('attempt ledger component binds detector and verifier runtime proofs legacy=' + legacy + ' full=' + completeRuntime, async t => {
        const f = fixture(t, { legacy, completeRuntime }); await f.cli.execute(f.request); assert.deepEqual(f.validate(), { calls: 1, complete: true });
        await f.verifier(f.verifyRequest);
        assert.deepEqual(f.validateReview(), { complete: true, detectorCalls: 1, verifierCalls: 1, candidates: 1 });
        if (completeRuntime) {
            const records = copy(f.rows); delete records.find(row => row.event === 'attempt-prepared').prepared.runtimeProof.nativeExecutableSha256;
            assert.throws(() => f.validate(records));
        }
    });
}

for (const termination of ['cancelled', 'PRIVATE RAW REASON\n']) test('attempt ledger component bounds termination evidence and rejects a terminated successful-looking chain: ' + JSON.stringify(termination), async t => {
    const f = fixture(t, { termination }); await f.cli.execute(f.request); await f.verifier(f.verifyRequest);
    const event = f.rows.find(row => row.event === 'verifier-attempt-termination');
    assert.equal(event.failure, termination === 'cancelled' ? 'cancelled' : 'unknown');
    assert.throws(() => f.validateReview(), /lifecycle/);
});

test('attempt ledger component a response received after verifier interruption remains interrupted', async t => {
    const f = fixture(t, { abortVerifier: true }); await f.cli.execute(f.request); await f.verifier(f.verifyRequest);
    assert.equal(f.rows.at(-1).status, 'interrupted'); assert(f.rows.at(-1).responseFile);
    assert.throws(() => f.validateReview());
});

test('attempt ledger component verifier exception after interruption preserves the failed prefix and process exit code', async t => {
    const error = { category: 'process', exitCode: 137 }, f = fixture(t, { abortVerifier: true, verifierFailure: error });
    await f.cli.execute(f.request); await assert.rejects(f.verifier(f.verifyRequest), value => value === error);
    assert.equal(f.rows.at(-1).status, 'interrupted'); assert.equal(f.rows.at(-1).failure.exitCode, 137); assert.throws(() => f.validateReview());
});
