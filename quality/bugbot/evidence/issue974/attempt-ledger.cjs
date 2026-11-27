'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function syncDescriptor(file, flags, write) {
    const descriptor = fs.openSync(file, flags, 0o600);
    try { write(descriptor); fs.fsyncSync(descriptor); }
    catch (error) {
        try { fs.closeSync(descriptor); } catch { /* Preserve the first write/sync error. */ }
        throw error;
    }
    fs.closeSync(descriptor);
}

function durableWrite(file, bytes, flag) {
    // Appends require the existing ledger; never recreate lost attempt history.
    const flags = flag === 'a' ? fs.constants.O_WRONLY | fs.constants.O_APPEND : flag;
    syncDescriptor(file, flags, descriptor => fs.writeFileSync(descriptor, bytes));
    if (flag === 'wx') {
        // Persist the new file name and the entry of its newly created artifact
        // directory before dispatch/completion. File fsync alone is insufficient.
        const directory = path.dirname(file);
        syncDescriptor(directory, 'r', () => {});
        syncDescriptor(path.dirname(directory), 'r', () => {});
    }
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
function createRecordedCli({ caseId, record, artifactDirectory, createClient, cancellation, recordObservation }) {
    assert(cancellation?.signal && typeof cancellation.abort === 'function', 'attempt recorder requires owned cancellation');
    const attemptIds = [];
    return {
        attemptIds,
        async execute(request) {
            assert.equal(request.signal, cancellation.signal, 'attempt cancellation must own the exact request signal');
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
            let observationFailure, observationFailed = false;
            const failedObservation = error => {
                if (observationFailed) return;
                observationFailed = true; observationFailure = error;
                // SDK observers are telemetry and deliberately swallow errors.
                // Cancel the original admitted signal synchronously instead:
                // replacing it would invalidate the live qualification scope.
                cancellation.abort();
            };
            try {
                const client = createClient({ observe(fact) {
                    try {
                        recordObservation?.(fact);
                        record({ event: 'attempt-observation', attemptId, fact });
                    } catch (error) { failedObservation(error); }
                } }, prepared => {
                    if (observationFailed) throw observationFailure;
                    try { record({ event: 'attempt-prepared', attemptId, prepared }); }
                    catch (error) { failedObservation(error); throw error; }
                });
                const response = await client.execute(request);
                if (observationFailed) throw observationFailure;
                assert.equal(typeof response, 'string', 'ordinary CLI response must be text');
                const responseFile = stem + '.response.txt';
                durableWrite(path.join(artifactDirectory, responseFile), response, 'wx');
                record({ event: 'attempt-finish', attemptId, status: 'completed', at: new Date().toISOString(),
                    responseFile, responseSha256: hash(response), providerReported: { model: null, usage: null } });
                return response;
            } catch (error) {
                const failure = observationFailed ? observationFailure : error;
                try {
                    record({ event: 'attempt-finish', attemptId,
                        status: observationFailed ? 'failed' : request.signal?.aborted || error?.category === 'cancelled' ? 'interrupted' : 'failed',
                        at: new Date().toISOString(), failure: boundedFailure(failure),
                        observationIncomplete: observationFailed, providerReported: { model: null, usage: null } });
                } catch { /* A secondary persistence failure cannot replace the original failure. */ }
                throw failure;
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
                ...(selected.runtime.nativeExecutableSha256 ? { nativeExecutableSha256: selected.runtime.nativeExecutableSha256 } : {}),
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

/** Verifier transport calls are real calls, including context restarts and
 * application follow-ups. Keep their own evidence rather than inventing SDK
 * AgentCliObserver events for this separate transport. */
function createRecordedVerifier({ caseId, record, artifactDirectory, transport, admitRuntime }) {
    let ordinal = 0;
    return async request => {
        const number = ++ordinal, attemptId = caseId + ':verifier:' + number;
        const stem = hash(caseId + ':verifier').slice(0, 24) + '-' + number;
        const requestFile = stem + '.request.json';
        const bytes = JSON.stringify({ prompt: request.prompt, schema: request.schema,
            threadId: request.threadId ?? null, candidateId: request.candidateId, configuration: request.configuration });
        durableWrite(path.join(artifactDirectory, requestFile), bytes, 'wx');
        record({ event: 'verifier-attempt-start', attemptId, caseId, ordinal: number, candidate: request.candidateId,
            at: new Date().toISOString(), configured: request.configuration, requestFile, requestSha256: hash(bytes),
            promptSha256: hash(request.prompt), schemaSha256: hash(JSON.stringify(request.schema)),
            providerReported: { model: null, usage: null } });
        try {
            const result = await transport({ ...request,
                onRuntimeAdmission(invocation) {
                    const runtimeProof = admitRuntime(invocation);
                    record({ event: 'verifier-attempt-prepared', attemptId, runtimeProof });
                    request.onRuntimeAdmission?.(invocation);
                },
                onInvocation(flags) {
                    record({ event: 'verifier-attempt-invocation', attemptId, flags });
                    request.onInvocation?.(flags);
                },
                onTermination(failure) {
                    record({ event: 'verifier-attempt-termination', attemptId,
                        failure: /^[a-z0-9-]{1,80}$/u.test(failure) ? failure : 'unknown' });
                    request.onTermination?.(failure);
                },
            });
            const responseFile = stem + '.response.txt', response = JSON.stringify(result);
            durableWrite(path.join(artifactDirectory, responseFile), response, 'wx');
            record({ event: 'verifier-attempt-finish', attemptId, at: new Date().toISOString(),
                status: request.signal?.aborted ? 'interrupted' : result.fact?.failure ? 'failed' : 'completed',
                responseFile, responseSha256: hash(response),
                providerReported: { model: result.fact?.reportedModel ?? null, usage: result.fact?.usage ?? null } });
            return result;
        } catch (error) {
            try {
                record({ event: 'verifier-attempt-finish', attemptId, at: new Date().toISOString(),
                    status: request.signal?.aborted ? 'interrupted' : 'failed', failure: boundedFailure(error),
                    providerReported: { model: null, usage: null } });
            } catch { /* Preserve the original failure; missing evidence stays incomplete. */ }
            throw error;
        }
    };
}

/** Independently check every actual transport call, not just the final labels.
 * Recovered provider/context failures remain calls with their original result. */
function validateCompleteReviewAttempts({ records, caseId, selected, detectorDirectory, verifierDirectory }) {
    const result = records.filter(row => row.event === 'result'); assert.equal(result.length, 1);
    const detectorStarts = records.filter(row => row.event === 'attempt-start');
    validateCompleteAttempts(records, [{ id: caseId, attemptIds: detectorStarts.map(row => row.attemptId) }],
        selected, detectorDirectory);
    const report = result[0].payload?.bugbotShadowVerification;
    assert(Array.isArray(report?.candidates), 'actual candidate observations are missing');
    const candidates = new Map(report.candidates.map(row => [row.id, row]));
    assert.equal(candidates.size, report.candidates.length, 'duplicate candidate observations');
    const starts = records.filter(row => row.event === 'verifier-attempt-start');
    const ids = new Set(starts.map(row => row.attemptId)); assert.equal(ids.size, starts.length);
    const calls = records.filter(row => /^verifier-attempt-/u.test(row.event));
    assert(calls.every(row => ids.has(row.attemptId)), 'orphan verifier attempt');
    assert(starts.every(row => candidates.has(row.candidate)), 'verifier ran without an actual candidate');
    const expectedRuntime = { executableSha256: selected.runtime.executableSha256 ?? selected.runtime.codexSha256,
        ...(selected.runtime.launcherSha256 && { launcherSha256: selected.runtime.launcherSha256 }),
        ...(selected.runtime.nativeExecutableSha256 && { nativeExecutableSha256: selected.runtime.nativeExecutableSha256 }) };
    const expectedFlags = { model: selected.verifier.model, modelProvider: selected.verifier.modelProvider,
        reasoningEffort: selected.verifier.effort, sandbox: 'read-only' };
    for (const [offset, start] of starts.entries()) {
        assert.equal(start.caseId, caseId); assert.equal(start.ordinal, offset + 1);
        assert.equal(start.attemptId, caseId + ':verifier:' + start.ordinal);
        assert.deepEqual(start.configured, selected.verifier);
        const chain = calls.filter(row => row.attemptId === start.attemptId);
        assert.deepEqual(chain.map(row => row.event), ['verifier-attempt-start', 'verifier-attempt-prepared',
            'verifier-attempt-invocation', 'verifier-attempt-finish'], 'missing or terminated verifier lifecycle');
        const [, prepared, invoked, finish] = chain;
        assert.deepEqual(prepared.runtimeProof, expectedRuntime); assert.deepEqual(invoked.flags, expectedFlags);
        const delivered = JSON.parse(artifact(verifierDirectory, start.requestFile, start.requestSha256));
        assert.equal(hash(delivered.prompt), start.promptSha256);
        assert.equal(hash(JSON.stringify(delivered.schema)), start.schemaSha256);
        assert.equal(delivered.candidateId, start.candidate); assert.deepEqual(delivered.configuration, selected.verifier);
        const response = JSON.parse(artifact(verifierDirectory, finish.responseFile, finish.responseSha256));
        assert(response.fact && typeof response.fact === 'object');
        assert.equal(finish.status, response.fact.failure ? 'failed' : 'completed');
        assert.deepEqual(finish.providerReported, { model: response.fact.reportedModel ?? null, usage: response.fact.usage ?? null });
        assert.equal(response.fact.resolvedModel, selected.verifier.model);
        assert.deepEqual(response.fact.invocation, expectedFlags);
        assert.equal(response.fact.promptSha256, start.promptSha256);
        assert.equal(response.fact.schemaSha256, start.schemaSha256);
        const candidateCalls = starts.filter(row => row.candidate === start.candidate);
        const turn = candidates.get(start.candidate).investigation?.turns?.[candidateCalls.indexOf(start)];
        assert(turn, 'candidate omitted an actual verifier turn');
        assert.deepEqual({ failure: turn.failure ?? null, model: turn.reportedModel ?? null, usage: turn.usage ?? null },
            { failure: response.fact.failure ?? null, model: response.fact.reportedModel ?? null, usage: response.fact.usage ?? null });
    }
    for (const candidate of candidates.values()) {
        const turns = candidate.investigation?.turns;
        assert(Array.isArray(turns), 'actual candidate turn inventory missing');
        assert.equal(turns.length, starts.filter(row => row.candidate === candidate.id).length, 'missing verifier call evidence');
    }
    return { complete: true, detectorCalls: detectorStarts.length, verifierCalls: starts.length, candidates: candidates.size };
}

module.exports = { createDurableRecorder, createRecordedCli, createRecordedVerifier, validateCompleteAttempts,
    validateCompleteReviewAttempts, boundedFailure };
