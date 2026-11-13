'use strict';

const { isDeepStrictEqual } = require('node:util');
const { requestFor, bindReply, validateProof, sourceBounds } = require('../coverage-895-pilot/runner.cjs');
const { initialRequest } = require('../git-request-replay/runner.cjs');
const { admit } = require('../git-request-replay/adapter.cjs');
const adapter = require('../git-path-pattern/adapter.cjs');
const { requestProblem, patternBytes } = require('../git-path-pattern/path-pattern.cjs');
const { dryRunPorts } = require('../on-demand/contract.cjs');
const { limits, remainingVerifierBudget, requireFact } = require('../v4/verification.cjs');
const sourceCaps = require('../detector-verifier-diagnostic/manifest.json').packetCeiling;
const plan = require('./manifest.json');

const { sourceLimits: caps } = adapter;
const firstTurn = { ...adapter, instructions: adapter.instructions
    + ` A pattern is limited to ${patternBytes} UTF-8 bytes and a request to ${plan.requestBytes} UTF-8 bytes. `
    + `The whole round can enumerate at most ${caps.treeEntries} tree entries, open ${caps.openedFiles} files, count ${caps.matches} matches and issue ${caps.receiptCount} receipts. `
    + `The listing caps at ${caps.treeBytes / 1024} KiB, the scan at ${caps.scanBytes / 1024} KiB, each blob at ${caps.blobBytes / 1024} KiB and serialized evidence at ${caps.evidenceBytes} bytes. `
    + `The round has ${caps.sourceWallMs / 1000} seconds and each Git call has at most ${caps.gitCallMs / 1000} seconds.` };
const verifierInitial = (model, session) => initialRequest(model, session, firstTurn);

const measure = ({ text, ...proof }) => proof;
const meter = fact => ['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(fact?.usage?.[key]) && fact.usage[key] >= 0);

function lookupStatus(lookup) {
    const fields = ({ status, reason }) => ({ status, ...(reason ? { reason } : {}) });
    return { ...fields(lookup), ...(lookup.results ? { targets: lookup.results.map(fields) } : {}) };
}

async function trial(slot, session, journal, send, publicationMode = plan.publicationMode) {
    const start = performance.now();
    const elapsed = () => Math.round(performance.now() - start);
    const log = (event, fields) => journal({ ...slot, event, ...fields });
    const calls = [];
    const writeAttempts = [];
    const ports = dryRunPorts(operation => writeAttempts.push(operation));
    let sourceUsage = { treeEntries: 0, openedFiles: 0, matches: 0, evidenceBytes: 0, sourceBytes: 0,
        elapsedMs: 0, receipts: 0, accounted: true };
    let requested = null, normalized = null, admission = null, lookup = null, retrieved = [], answer = null, failure = null, stage = 'initial';
    async function ask(proofs, retrieval) {
        const { request, facts } = retrieval === undefined
            ? verifierInitial(slot.model, session) : requestFor(slot.model, session, proofs, retrieval);
        const deadline = Math.min(plan.callMs, plan.caseMs - elapsed() - 1000);
        requireFact(deadline >= limits.minRetryMs && calls.length < plan.maxCallsPerTrial, 'case-call-budget');
        const call = calls.length + 1;
        const sent = { ...facts, deadline, sources: proofs.map(measure), ...(retrieval ? { retrieval } : {}) };
        log('attempt-started', { call, sent });
        let response, fact;
        try {
            ({ response, fact } = await send(request, 'closed', null, deadline));
        } catch (error) {
            fact = error.fact ?? { outcome: 'transport-failed', usage: null };
            throw error;
        } finally {
            calls.push({ call, sent, fact });
            log('attempt-finished', { call, fact });
        }
        requireFact(fact.promptSha256 === sent.promptSha256 && fact.schemaSha256 === sent.schemaSha256, 'session-identity');
        requireFact(fact.turnCompletions === 1 && !fact.toolTypes?.length && !fact.inspections, 'closed-session-tool-event');
        return response;
    }

    try {
        if (publicationMode !== 'dry-run') ports.publishReview();
        const first = await ask(session.initial);
        requireFact(first && Object.keys(first).sort().join(',') === 'decision,request'
            && (first.request === null) !== (first.decision === null), 'first-response-shape');
        if (first.decision !== null) {
            stage = 'verdict';
            answer = bindReply(first.decision, session, session.initial);
        } else {
            stage = 'admission';
            requested = first.request;
            ({ normalized, admission } = admit(requested, session.identity.scopes, requestProblem));
            log('request', { requested, normalized, admission });
            if (slot.arm === 'fixed') lookup = { status: 'unresolved', reason: 'fixed-single-call' };
            else {
                requireFact(calls.every(({ fact }) => meter(fact)), 'verifier-usage-unavailable');
                requireFact(remainingVerifierBudget(calls.map(({ fact }) => fact), elapsed()), 'case-call-budget');
                stage = 'retrieval';
                if (admission.status !== 'admitted') lookup = admission;
                else if (slot.arm === 'repeat') lookup = { status: 'withheld', reason: 'control-no-new-source' };
                else {
                    const actual = adapter.read(session.cwd, session.identity, requested);
                    requireFact(isDeepStrictEqual(actual.admission, admission)
                        && isDeepStrictEqual(actual.normalized, normalized), 'admission-integrity');
                    const { receipts = [], ...result } = actual.result;
                    lookup = result;
                    retrieved = receipts;
                    sourceUsage = actual.usage ?? { ...sourceUsage, accounted: false };
                }
                log('lookup', { lookup, newProofs: retrieved.map(measure) });
                const known = new Set(session.initial.map(proof => proof.id));
                const proofs = [...session.initial];
                for (const proof of retrieved) {
                    requireFact(proof.kind === 'git', 'retrieval-receipt-kind');
                    validateProof(session, proof);
                    if (!known.has(proof.id)) {
                        known.add(proof.id);
                        proofs.push(proof);
                    }
                }
                stage = 'delivery';
                const second = await ask(proofs, lookupStatus(lookup));
                stage = 'verdict';
                answer = bindReply(second, session, proofs);
            }
        }
    } catch (error) {
        const code = error.fact?.outcome ?? error.code ?? error.message;
        failure = { stage, code: typeof code === 'string' && /^[a-z][a-z0-9-]{2,70}$/u.test(code) ? code : 'runner-failed' };
    }
    const wallMs = elapsed();
    const totals = calls.length && calls.every(({ fact }) => meter(fact)) ? Object.fromEntries(['input_tokens', 'output_tokens']
        .map(key => [key, calls.reduce((sum, { fact }) => sum + fact.usage[key], 0)])) : null;
    const within = totals && totals.input_tokens <= plan.inputTokens && totals.output_tokens <= plan.outputTokens
        && wallMs <= plan.caseMs && sourceUsage.accounted
        && Object.entries(sourceBounds).every(([key, cap]) => sourceUsage[key] <= sourceCaps[cap]);
    return { ...slot, event: 'result', ...session.identity, calls, requested, normalized, admission, lookup, retrieved: retrieved.map(measure),
        answer, failure, writeAttempts, wallMs, budget: !totals ? 'unknown' : within ? 'within' : 'exceeded', totals, sourceUsage };
}

module.exports = { trial, verifierInitial };
