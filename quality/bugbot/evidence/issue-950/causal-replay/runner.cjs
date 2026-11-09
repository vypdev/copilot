'use strict';

// The next pilot supplies its transport explicitly after preregistration.
// Frozen experiments keep their original runner and evidence unchanged.
const { buildRequest, scenario } = require('../tree-search/run.cjs');
const { assess, dryRunPorts, limits, receipt } = require('../tree-search/contract.cjs');
const { byteLength, digest, remainingVerifierBudget } = require('../v4/verification.cjs');
const { retrieve } = require('./retrieve.cjs');
const { retrieve: retrieveCommon } = require('../tree-search/git-evidence.cjs');

const clock = () => Math.round(performance.now());

const spent = calls => ({
    input: calls.reduce((sum, call) => sum + (call.usage?.input_tokens ?? 0), 0),
    cached: calls.reduce((sum, call) => sum + (call.usage?.cached_input_tokens ?? 0), 0),
    output: calls.reduce((sum, call) => sum + (call.usage?.output_tokens ?? 0), 0),
    unknown: calls.filter(call => !call.usage).length,
});

function remaining(calls, elapsed) {
    const cost = spent(calls);
    if (cost.input > limits.subjectInput || cost.output > limits.subjectOutput) throw Error('verifier-token-budget');
    if (elapsed > limits.subjectWallMs) throw Error('subject-wall-budget');
    return remainingVerifierBudget(calls, elapsed) && calls.length < limits.verifierCalls;
}

async function trial(row, f, journal, send, { publicationMode = 'dry-run', commonGitOnly = false, comparison } = {}) {
    if (typeof send !== 'function') throw new TypeError('An explicit verifier transport is required.');
    const calls = [], writeAttempts = [];
    const ports = dryRunPorts(name => writeAttempts.push(name));
    const operation = digest(comparison ?? `causal-runner/${row.trial}/${row.arm}/${row.model}/${row.subject}/${row.repetition}`);
    const candidate = f.c.id + '-' + digest(JSON.stringify([f.c, f.anchor.selected, f.b.diffSha256])).slice(0, 12);
    const binding = { operation, candidate, head: f.b.head, tree: f.b.tree, scopes: [''] };
    const receipts = [...f.initial, { kind: 'diff', path: f.c.path, text: f.excerpt,
        comparison: f.b.diffSha256 }].map(source => receipt(binding, source));
    const start = clock();
    let lookup, evidenceRequest, retried = false, rounds = 0;
    const note = (event, data) => journal({ ...row, event, ...data });
    const submit = async request => {
        const elapsed = clock() - start;
        const deadline = Math.min(limits.callWallMs, limits.subjectWallMs - elapsed - 1200);
        if (!remaining(calls, elapsed) || deadline < limits.minRetryMs) throw Error('candidate-call-budget');
        note('attempt-started', { round: rounds, attempt: calls.length + 1, deadline,
            promptSha256: digest(request.prompt) });
        const register = (fact) => {
            const recorded = fact ?? { outcome: 'transport-failed', usage: null, turnCompletions: 0, toolTypes: [] };
            calls.push(recorded);
            note('attempt-finished', { round: rounds, attempt: calls.length, fact: recorded });
        };
        try {
            const result = await send(request, 'closed', null, deadline);
            register(result.fact);
            return result.response;
        } catch (failure) {
            register(failure.fact);
            throw failure;
        }
    };
    const query = async ({ receipts: packet, followup }) => {
        rounds++;
        if (byteLength(JSON.stringify({ receipts: packet, followup })) > limits.packetBytes) {
            throw Error('packet-byte-budget');
        }
        const request = buildRequest(row, f, binding, packet, followup);
        try {
            return await submit(request);
        } catch (failure) {
            const fact = failure.fact;
            if (retried || fact?.outcome !== 'provider-turn-timeout' || fact.turnCompletions || fact.toolTypes.length
                || !remaining(calls, clock() - start)
                || limits.subjectWallMs - (clock() - start) < limits.minRetryMs + 1200) throw failure;
            retried = true;
            return submit(request);
        }
    };
    try {
        if (publicationMode !== 'dry-run') ports.publishReview();
        const decision = await assess({ binding, receipts, arm: row.arm, ask: query,
            onRequest: request => {
                evidenceRequest = request;
                note('evidence-requested', { request });
            },
            acquire: request => commonGitOnly ? retrieveCommon(f.cwd, binding, request) : retrieve(f.cwd, binding, request, {
                context: { base: f.b.base, anchor: f.anchor.selected },
            }),
            onEvidence: result => {
                const { receipts: artifacts = [], ...status } = result;
                lookup = { ...status, receipts: artifacts.map(({ text: _private, ...artifact }) => artifact) };
                note('evidence-response', { lookup });
            },
        });
        remaining(calls, clock() - start);
        const { reason, nextStep } = decision;
        return { ...row, status: 'completed', head: f.b.head, anchor: f.anchor, rounds, evidenceRequest, lookup,
            verdict: decision.verdict, citations: decision.citations, reasonSha256: digest(reason),
            ...(nextStep && { nextStepSha256: digest(nextStep) }), calls, ...spent(calls), wallMs: clock() - start, writeAttempts };
    } catch (failure) {
        const reason = /^[a-z][a-z0-9-]{2,70}$/u.test(failure.message) ? failure.message : 'trial-contract-failed';
        return { ...row, status: reason === 'provider-turn-timeout' ? 'expired' : 'failed', head: f.b.head,
            anchor: f.anchor, rounds, evidenceRequest, lookup, reason, calls, ...spent(calls),
            wallMs: clock() - start, writeAttempts };
    }
}

module.exports = { scenario, trial };
