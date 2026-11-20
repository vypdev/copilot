'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function durableWrite(file, bytes, flag) {
    const descriptor = fs.openSync(file, flag, 0o600);
    try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
}

function createDurableRecorder(file) {
    durableWrite(file, '', 'wx');
    return row => durableWrite(file, JSON.stringify(row) + '\n', 'a');
}

function boundedFailure(error) {
    const allowed = ['configuration', 'timeout', 'cancelled', 'process', 'output'];
    return { category: allowed.includes(error?.category) ? error.category : 'unknown',
        retryable: error?.retryable === true,
        ...(Number.isSafeInteger(error?.exitCode) ? { exitCode: error.exitCode } : {}) };
}

/** Wrap each real execute call, including ordinary application-generated follow-ups. */
function createRecordedCli({ caseId, record, artifactDirectory, createClient }) {
    const attemptIds = [];
    return {
        attemptIds,
        async execute(request) {
            const ordinal = attemptIds.length + 1, attemptId = caseId + ':' + ordinal;
            const stem = hash(caseId).slice(0, 24) + '-' + ordinal;
            const requestBytes = JSON.stringify({ prompt: request.prompt, outputSchema: request.outputSchema ?? null });
            const requestFile = stem + '.request.json';
            durableWrite(path.join(artifactDirectory, requestFile), requestBytes, 'wx');
            record({ event: 'attempt-start', attemptId, caseId, ordinal, at: new Date().toISOString(),
                configured: request.configuration, promptSha256: hash(request.prompt),
                schemaSha256: hash(JSON.stringify(request.outputSchema ?? null)),
                requestFile, requestSha256: hash(requestBytes), providerReported: { model: null, usage: null } });
            attemptIds.push(attemptId);
            let observationFailure;
            try {
                const client = createClient({ observe(fact) {
                    try { record({ event: 'attempt-observation', attemptId, fact }); }
                    catch (error) { observationFailure ??= error; }
                } }, prepared => record({ event: 'attempt-prepared', attemptId, prepared }));
                const response = await client.execute(request);
                if (observationFailure) throw observationFailure;
                assert.equal(typeof response, 'string', 'ordinary CLI response must be text');
                const responseFile = stem + '.response.txt';
                durableWrite(path.join(artifactDirectory, responseFile), response, 'wx');
                record({ event: 'attempt-finish', attemptId, status: 'completed', at: new Date().toISOString(),
                    responseFile, responseSha256: hash(response), providerReported: { model: null, usage: null } });
                return response;
            } catch (error) {
                record({ event: 'attempt-finish', attemptId,
                    status: request.signal?.aborted || error?.category === 'cancelled' ? 'interrupted' : 'failed',
                    at: new Date().toISOString(), failure: boundedFailure(error),
                    observationIncomplete: observationFailure !== undefined, providerReported: { model: null, usage: null } });
                throw error;
            }
        },
    };
}

function artifact(directory, file, digest) {
    assert(typeof file === 'string' && /^[a-f0-9]{24}-[1-9][0-9]*\.(?:request\.json|response\.txt)$/u.test(file),
        'invalid attempt artifact path');
    const target = path.join(directory, file);
    assert(fs.lstatSync(target).isFile(), 'attempt artifact must be a regular file');
    const bytes = fs.readFileSync(target);
    assert.equal(hash(bytes), digest, 'attempt artifact changed');
    return bytes;
}

/** Independent admission: every actual application call must have one complete chain. */
function validateCompleteAttempts(ledger, cases, selected, artifactDirectory) {
    const starts = ledger.filter(row => row.event === 'attempt-start');
    assert(starts.length >= cases.length, 'missing application attempts');
    const ids = new Set(starts.map(row => row.attemptId));
    assert.equal(ids.size, starts.length, 'duplicate application attempt');
    const listed = cases.flatMap(row => row.attemptIds ?? []);
    assert.equal(listed.length, starts.length, 'case attempt accounting differs');
    assert.deepEqual([...listed].sort(), [...ids].sort(), 'unlisted or duplicate case attempt');
    const attempts = ledger.filter(row => /^attempt-/u.test(row.event));
    assert(attempts.every(row => ids.has(row.attemptId)), 'orphan attempt record');
    for (const outer of cases) {
        assert(outer.attemptIds?.length > 0, 'completed case has no actual call');
        for (const [offset, id] of outer.attemptIds.entries()) {
            const chain = attempts.filter(row => row.attemptId === id);
            assert.deepEqual(chain.map(row => row.event), ['attempt-start', 'attempt-observation',
                'attempt-prepared', 'attempt-observation', 'attempt-observation', 'attempt-finish'],
            'attempt must have one ordinary complete lifecycle');
            const [start, began, prepared, admitted, completed, finish] = chain;
            assert.equal(start.caseId, outer.id); assert.equal(start.ordinal, offset + 1);
            assert.deepEqual(start.configured, selected.detector, 'attempt profile differs');
            assert.deepEqual([began.fact.state, admitted.fact.state, completed.fact.state], ['started', 'admitted', 'completed']);
            assert.equal(began.fact.phase, 'plan'); assert.equal(admitted.fact.phase, 'preflight');
            assert.equal(completed.fact.phase, 'run'); assert.equal(finish.status, 'completed');
            for (const observation of [began, admitted, completed]) {
                assert.equal(observation.fact.provider, selected.detector.provider);
                assert.equal(observation.fact.capability, 'findings');
            }
            assert.equal(admitted.fact.workspaceMode, 'read-only');
            assert.equal(admitted.fact.version, selected.runtime.codex);
            assert.equal(prepared.prepared.output, 'native-and-local-json-schema');
            assert.equal(admitted.fact.outputContract, prepared.prepared.output);
            assert.match(prepared.prepared.schemaArtifactSha256 ?? '', /^[a-f0-9]{64}$/u);
            assert(admitted.fact.artifactHashes?.includes(prepared.prepared.schemaArtifactSha256), 'delivered native schema proof missing');
            assert.deepEqual(prepared.prepared.flags, { model: selected.detector.model, modelProvider: selected.detector.modelProvider,
                reasoningEffort: selected.detector.effort, sandbox: 'read-only' });
            assert.deepEqual(prepared.prepared.runtimeProof, {
                executableSha256: selected.runtime.executableSha256 ?? selected.runtime.codexSha256,
                ...(selected.runtime.launcherSha256 ? { launcherSha256: selected.runtime.launcherSha256 } : {}),
            });
            assert.equal(prepared.prepared.runtimeContract.version, selected.runtime.codex);
            assert.equal(prepared.prepared.workspaceMode, 'read-only');
            assert.equal(prepared.prepared.qualificationInvestigation, true);
            const delivered = JSON.parse(artifact(artifactDirectory, start.requestFile, start.requestSha256));
            assert.equal(hash(delivered.prompt), start.promptSha256);
            assert.equal(hash(JSON.stringify(delivered.outputSchema)), start.schemaSha256);
            const response = artifact(artifactDirectory, finish.responseFile, finish.responseSha256);
            assert.equal(completed.fact.outputBytes, response.byteLength, 'actual response byte count differs');
        }
    }
    return { calls: starts.length, complete: true };
}

module.exports = { createDurableRecorder, createRecordedCli, validateCompleteAttempts, boundedFailure };
