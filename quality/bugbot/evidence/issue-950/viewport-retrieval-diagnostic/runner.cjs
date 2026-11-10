'use strict';

const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { makeSession, message, bindReply } = require('../complete-verdict-diagnostic/runner.cjs');
const { sourceReader } = require('../detector-verifier-diagnostic/runner.cjs');
const { requestProblem } = require('../tree-search/git-evidence.cjs');
const { dryRunPorts, receipt } = require('../on-demand/contract.cjs');
const { byteLength, digest, limits, remainingVerifierBudget } = require('../v4/verification.cjs');
const prior = require('../complete-verdict-diagnostic/manifest.json');
const plan = require('./manifest.json');

const caps = prior.ceiling;
const packetCaps = prior.packetCeiling;
const sourceCaps = require('../detector-verifier-diagnostic/manifest.json').packetCeiling;
const scopes = [''];
const measure = ({ text, ...proof }) => proof;
const describe = ({ alias, proof }) => ({ alias, ...measure(proof) });
const requireFact = (value, code) => { if (!value) throw Object.assign(new Error(code), { code }); };
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const choice = (...values) => ({ type: 'string', enum: values });
const nullable = type => ({ type: [type, 'null'] });
const requestShape = object({
    revision: choice('head'),
    kind: choice('readBlob', 'searchTree'),
    targets: { type: 'array', items: object({ scope: { type: 'string' }, workspace: nullable('string'),
        match: choice('lines', 'name', 'literal'), query: nullable('string'), start: nullable('integer'), end: nullable('integer') }) },
});

function seed(subject, fixture) {
    const session = makeSession(subject, fixture);
    assert.deepEqual(session.packet.map(({ alias }) => alias), ['S1', 'S2', 'S3', 'S4']);
    return { ...session, packet: session.packet.slice(1) };
}

function requestFor(session, retrieval) {
    const result = message(plan.model, session, session.packet);
    const { request } = result;
    const finalSchema = request.options.schema;
    const separator = '\n' + JSON.stringify({ candidate: session.candidate, head: session.identity.head, diff: session.diff, sources: session.packet });
    assert(request.prompt.endsWith(separator));
    const instructions = request.prompt.slice(0, -separator.length)
        .replace('four supplied Git fragments', 'supplied Git fragments');
    if (retrieval === undefined) {
        request.prompt = instructions.replace('No tools or additional reads are available.',
            'You cannot use tools. If material evidence is missing, you may ask the application for one bounded Git read from the reviewed head.')
            + '\nReturn either a final decision with request set to null, or a request with decision set to null. Request only the source needed to resolve a material gap. '
            + 'Use readBlob for one exact file scope with match lines, inclusive start and end, and null query and workspace. '
            + 'Use searchTree for up to three targets with a file or directory scope, match name or literal, a query, and null start and end. '
            + 'Use null workspace unless targeting a declared workspace. A search result includes bounded context around a match. No further requests are available after this round.'
            + separator;
        request.options.schema = object({ decision: { ...finalSchema, type: ['object', 'null'] },
            request: { ...requestShape, type: ['object', 'null'] } });
    } else {
        request.prompt = instructions + '\nThe evidence request is closed. Use the application status below and cite any supplied receipts that support the verdict. '
            + 'If a material gap remains, state it and the next check in missing.\n'
            + JSON.stringify({ retrieval }) + separator;
    }
    const packetBytes = result.facts.packetBytes + (retrieval === undefined ? 0 : byteLength(JSON.stringify({ retrieval })));
    const facts = { ...result.facts, promptSha256: digest(request.prompt), promptBytes: byteLength(request.prompt),
        schemaSha256: digest(JSON.stringify(request.options.schema)), packetBytes };
    requireFact(facts.packetBytes <= packetCaps.packetBytes && facts.promptBytes <= packetCaps.promptBytes, 'full-packet-budget');
    return { request, facts };
}

function parseFirst(response) {
    requireFact(response && typeof response === 'object' && Object.keys(response).length === 2
        && Object.hasOwn(response, 'request') && Object.hasOwn(response, 'decision')
        && (response.request === null) !== (response.decision === null), 'first-response-shape');
    if (response.request !== null) {
        requireFact(response.request && typeof response.request === 'object' && !Array.isArray(response.request)
            && byteLength(JSON.stringify(response.request)) <= plan.requestBytes, 'request-envelope-budget');
    }
    return response;
}

function admission(request) {
    if (Object.keys(request).sort().join(',') !== 'kind,revision,targets') return { status: 'denied', reason: 'request-shape' };
    const { revision, ...query } = request;
    if (revision !== 'head') return { status: 'denied', reason: 'revision-not-authorized' };
    return requestProblem(query, scopes);
}

async function trial(row, seedSession, fixture, journal, send, publicationMode = plan.publicationMode) {
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const log = (event, fields) => journal({ ...row, event, ...fields });
    const calls = [];
    const writes = [];
    const ports = dryRunPorts(operation => writes.push(operation));
    const reader = sourceReader(fixture, { head: { ...seedSession.identity, scopes } });
    let requested = null, lookup = null, answer = null, failure = null, delivered = seedSession.packet;
    let deliveryStatus = 'initial-only';
    const metered = fact => ['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(fact?.usage?.[key]) && fact.usage[key] >= 0);
    async function ask(prepared, packet) {
        const call = calls.length + 1;
        const deadline = Math.min(prior.verifier.callMs, caps.caseMs - elapsed() - 1000);
        requireFact(deadline >= limits.minRetryMs && call <= plan.attemptsPerCase, 'case-call-budget');
        const sent = { ...prepared.facts, sources: packet.map(describe), deadline };
        log('attempt-started', { call, sent });
        let response, fact;
        try {
            ({ response, fact } = await send(prepared.request, 'closed', null, deadline));
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
        const first = parseFirst(await ask(requestFor(seedSession), seedSession.packet));
        if (first.decision !== null) {
            answer = bindReply(first.decision, seedSession, seedSession.packet);
        } else {
            requested = first.request;
            const denial = admission(requested);
            log('request', { requested, admission: denial ?? { status: 'admitted' } });
            if (row.arm === 'fixed') {
                lookup = { status: 'unresolved', reason: 'fixed-single-call' };
            } else {
                requireFact(calls.every(({ fact }) => metered(fact)), 'verifier-usage-unavailable');
                requireFact(remainingVerifierBudget(calls.map(({ fact }) => fact), elapsed()), 'case-call-budget');
                let source = [];
                if (denial) lookup = denial;
                else if (row.arm === 'repeat') lookup = { status: 'withheld', reason: 'control-no-new-source' };
                else {
                    const { receipts = [], ...result } = reader.read(requested, false);
                    lookup = result;
                    source = receipts;
                }
                const newProofs = source.map(measure);
                log('lookup', { lookup, newProofs });
                const known = new Set(seedSession.packet.map(({ proof }) => proof.id));
                const appended = [];
                for (const proof of source) {
                    requireFact(proof.kind === 'git' && proof.operation === seedSession.identity.operation
                        && proof.candidate === seedSession.identity.candidate && proof.head === seedSession.identity.head
                        && proof.tree === seedSession.identity.tree && isDeepStrictEqual(proof, receipt(seedSession.identity, proof)), 'receipt-integrity');
                    if (known.has(proof.id)) continue;
                    known.add(proof.id);
                    appended.push({ alias: 'S' + (appended.length + 5), proof });
                }
                const session = { ...seedSession, packet: [...seedSession.packet, ...appended] };
                // Return every valid adapter fragment in order, or fail the whole delivery bound.
                const status = { status: lookup.status, ...(lookup.reason ? { reason: lookup.reason } : {}),
                    ...(lookup.results ? { targets: lookup.results.map(result => ({ status: result.status,
                        ...(result.reason ? { reason: result.reason } : {}) })) } : {}) };
                const prepared = requestFor(session, status);
                delivered = session.packet;
                deliveryStatus = appended.length ? 'new-source' : 'no-new-source';
                answer = bindReply(await ask(prepared, delivered), session, delivered);
            }
        }
    } catch (error) {
        const code = error.fact?.outcome ?? error.code ?? error.message;
        failure = { code: typeof code === 'string' && /^[a-z][a-z0-9-]{2,70}$/u.test(code) ? code : 'runner-failed',
            field: error.field ?? null };
    }
    const wallMs = elapsed();
    const knownUsage = calls.length > 0 && calls.every(({ fact }) => metered(fact));
    const totals = knownUsage ? Object.fromEntries(['input_tokens', 'output_tokens'].map(key =>
        [key, calls.reduce((sum, { fact }) => sum + fact.usage[key], 0)])) : null;
    const sourceUsage = reader.usage();
    const within = totals && totals.input_tokens <= caps.grossInputTokens && totals.output_tokens <= caps.outputTokens
        && wallMs <= caps.caseMs && calls.length <= plan.attemptsPerCase && sourceUsage.accounted
        && Object.entries({ elapsedMs: 'sourceMs', sourceBytes: 'sourceBytes', evidenceBytes: 'evidenceBytes',
            openedFiles: 'openedFiles', matches: 'matches', treeEntries: 'treeEntries', receipts: 'receipts' })
            .every(([key, cap]) => sourceUsage[key] <= sourceCaps[cap]);
    return { ...row, event: 'result', ...seedSession.identity, calls, requested, lookup, deliveryStatus, answer, failure,
        writeAttempts: writes, wallMs, budget: !totals ? 'unknown' : within ? 'within' : 'exceeded', totals, sourceUsage };
}

module.exports = { seed, requestFor, trial };
