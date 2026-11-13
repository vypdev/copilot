'use strict';

const assert = require('node:assert/strict');
const { requestFor, bindReply, validateProof, sourceBounds } = require('../coverage-895-pilot/runner.cjs');
const { dryRunPorts } = require('../on-demand/contract.cjs');
const { digest, byteLength, requireFact, limits, remainingVerifierBudget } = require('../v4/verification.cjs');
const plan = require('./manifest.json');
const sourceCaps = require('../detector-verifier-diagnostic/manifest.json').packetCeiling;

const measure = ({ text, ...proof }) => proof;
const verdictGuidance = 'Explain what the effective project configuration does and the effect on the report and inventory comparison. '
    + 'Cite all material sources for Storybook collection and conversion to test includes, the project configuration and extension list, '
    + 'the coverage-option merge and exclusion match, the V8 filter, remap, merge and JSON-summary output, and the command and code that check the inventory. '
    + 'A default library behavior does not by itself establish the effective behavior of this project. If any material premise is unresolved, return inconclusive and name that gap.';

function finalRequest(model, session, proofs, retrieval) {
    const { request, facts } = requestFor(model, session, proofs, retrieval);
    const lines = request.prompt.split('\n');
    assert.equal(lines.length, 4);
    lines[2] = verdictGuidance;
    const prompt = lines.join('\n');
    const promptBytes = byteLength(prompt);
    requireFact(promptBytes <= plan.promptBytes, 'full-packet-budget');
    return { request: { ...request, prompt }, facts: { ...facts, promptBytes, promptSha256: digest(prompt) } };
}

const metered = fact => ['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(fact?.usage?.[key]) && fact.usage[key] >= 0);

async function trial(slot, session, journal, send, experiment, publicationMode = plan.publicationMode) {
    const start = performance.now();
    const elapsed = () => Math.round(performance.now() - start);
    const log = (event, fields) => journal({ ...slot, event, ...fields });
    const calls = [], writeAttempts = [];
    const ports = dryRunPorts(operation => writeAttempts.push(operation));
    let delivered = [], answer = null, failure = null, selection = null, stage = 'initial';
    const turnLimit = experiment.initial ? 2 : 1;

    async function ask(message, proofs) {
        const { request, facts } = message;
        const deadline = Math.min(plan.callMs, plan.caseMs - elapsed() - 1000);
        requireFact(calls.length < turnLimit && deadline >= limits.minRetryMs, 'case-call-budget');
        const call = calls.length + 1;
        const sent = { ...facts, deadline, sources: proofs.map(measure) };
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
        if (experiment.initial) {
            const response = await ask(experiment.initial(slot.model, session), session.initial);
            log('initial-assessment', { disposition: response?.request ? 'request' : response?.decision?.verdict ?? 'invalid' });
            stage = 'budget';
            requireFact(calls.every(({ fact }) => metered(fact)), 'verifier-usage-unavailable');
            requireFact(remainingVerifierBudget(calls.map(({ fact }) => fact), elapsed()), 'case-call-budget');
        }
        stage = 'selection';
        selection = experiment.select(slot, session);
        const { proofs, ...details } = selection;
        for (const proof of proofs) validateProof(session, proof);
        log('sources-selected', { ...details, proofs: proofs.map(measure) });
        stage = 'delivery';
        const reply = await ask(finalRequest(slot.model, session, proofs, selection.status), proofs);
        delivered = proofs.map(measure);
        stage = 'verdict';
        answer = bindReply(reply, session, proofs);
    } catch (error) {
        const code = error.fact?.outcome ?? error.code ?? error.message;
        failure = { stage, code: typeof code === 'string' && /^[a-z][a-z0-9-]{2,70}$/u.test(code) ? code : 'runner-failed' };
    }
    const wallMs = elapsed();
    const totals = calls.length && calls.every(({ fact }) => metered(fact)) ? Object.fromEntries(['input_tokens', 'output_tokens']
        .map(key => [key, calls.reduce((sum, { fact }) => sum + fact.usage[key], 0)])) : null;
    const usage = selection?.usage;
    const within = totals && totals.input_tokens <= plan.inputTokens && totals.output_tokens <= plan.outputTokens
        && wallMs <= plan.caseMs && (!usage || (usage.accounted && Object.entries(sourceBounds).every(([key, cap]) => usage[key] <= sourceCaps[cap])));
    const selected = selection && { ...selection, proofs: selection.proofs.map(measure) };
    return { ...slot, event: 'result', ...session.identity, calls, selected, delivered,
        answer, failure, wallMs, writeAttempts, budget: !totals ? 'unknown' : within ? 'within' : 'exceeded', totals };
}

module.exports = { finalRequest, trial };
