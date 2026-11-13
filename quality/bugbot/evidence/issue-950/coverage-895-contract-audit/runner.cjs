'use strict';

const { message: historicalMessage } = require('../coverage-895-lifecycle-diagnostic/runner.cjs');
const { dryRunPorts } = require('../on-demand/contract.cjs');
const { digest, byteLength, requireFact } = require('../v4/verification.cjs');
const plan = require('../coverage-895-lifecycle-diagnostic/manifest.json');
const { instructions, schema, bindReply, VerdictFailure } = require('./verdict.cjs');

function message(model, packet) {
    const { request, facts } = historicalMessage(model, packet);
    const parts = request.prompt.split('\n');
    requireFact(parts.length === 4, 'prompt-layout');
    parts[2] = 'Return confirmed when the chain supports the hypothesis or refuted with concrete counterevidence. ' + instructions;
    const prompt = parts.join('\n');
    const promptBytes = byteLength(prompt);
    requireFact(promptBytes <= plan.promptBytes, 'full-packet-budget');
    const output = schema(Object.keys(facts.aliases));
    return { request: { ...request, prompt, options: { schema: output } },
        facts: { ...facts, promptBytes, promptSha256: digest(prompt), schemaSha256: digest(JSON.stringify(output)) } };
}

async function trial(model, packet, journal, send, publicationMode = plan.publicationMode, contract = { message, bindReply }) {
    const started = performance.now();
    const writeAttempts = [];
    const ports = dryRunPorts(operation => writeAttempts.push(operation));
    let stage = 'selection', answer = null, failure = null, sent = null, fact = null;
    try {
        if (publicationMode !== 'dry-run') ports.publishReview();
        const { request, facts } = contract.message(model, packet);
        stage = 'delivery';
        sent = { ...facts, deadline: plan.callMs };
        journal({ event: 'attempt-started', sent });
        let response;
        try {
            ({ response, fact } = await send(request, 'closed', null, plan.callMs));
        } catch (error) {
            fact = error.fact ?? { outcome: 'transport-failed', usage: null };
            throw error;
        } finally {
            journal({ event: 'attempt-finished', fact });
        }
        requireFact(fact.promptSha256 === sent.promptSha256 && fact.schemaSha256 === sent.schemaSha256, 'session-identity');
        requireFact(fact.turnCompletions === 1 && !fact.toolTypes?.length && !fact.inspections, 'closed-session-tool-event');
        stage = 'verdict';
        answer = contract.bindReply(response, packet.session, packet.proofs);
    } catch (error) {
        const code = error.fact?.outcome ?? error.code ?? error.message;
        failure = error instanceof VerdictFailure ? { stage, ...error.diagnostic }
            : { stage, code: typeof code === 'string' && /^[a-z][a-z0-9-]{2,70}$/u.test(code) ? code : 'runner-failed' };
        journal({ event: 'rejected', failure });
    }
    const wallMs = Math.round(performance.now() - started);
    const metered = ['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(fact?.usage?.[key]) && fact.usage[key] >= 0);
    const within = metered && fact.usage.input_tokens <= plan.inputTokens && fact.usage.output_tokens <= plan.outputTokens
        && wallMs <= plan.caseMs;
    return { ...packet.session.identity, sent, fact, answer, failure, wallMs, writeAttempts,
        budget: !metered ? 'unknown' : within ? 'within' : 'exceeded' };
}

module.exports = { message, trial };
