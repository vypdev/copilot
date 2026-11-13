'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const Ajv = require('ajv');
const { fixtures } = require('../coverage-895-pilot/fixture.cjs');
const { prepare } = require('../coverage-895-lifecycle-diagnostic/prepared.cjs');
const { message: oldMessage } = require('../coverage-895-lifecycle-diagnostic/runner.cjs');
const { receipt } = require('../on-demand/contract.cjs');
const { digest } = require('../v4/verification.cjs');
const { assertStrictOutputSchema } = require('../../../../../src/application/policies/agent_execution/strict_output_schema_policy.ts');
const { message, trial } = require('./runner.cjs');
const { limits, bindReply } = require('./verdict.cjs');

const model = 'gpt-6.1-sol';
const good = { verdict: 'confirmed', citations: ['E1'], reason: 'Simulated conclusion.', missing: null };
const unknown = { ...good, verdict: 'inconclusive', citations: [], missing: 'Simulated gap.' };
const marker = 'REJECTED_BODY_MARKER';
const diagnostic = (code, field, size) => ({ stage: 'verdict', code, field, ...size });
const invalid = (name, response, code, field, size) => ({ name, response, expected: diagnostic(code, field, size) });

function examples() {
    const rows = [
        { name: 'confirmed', response: good },
        { name: 'refuted', response: { ...good, verdict: 'refuted' } },
        { name: 'inconclusive', response: unknown },
        invalid('top-level-type', [], 'invalid-type', '$'),
        invalid('missing-field', { verdict: 'confirmed', citations: ['E1'], missing: null }, 'missing-field', 'reason'),
        invalid('extra-field', { ...good, [marker]: marker }, 'additional-field', '$'),
        invalid('verdict-type', { ...good, verdict: 1 }, 'invalid-type', 'verdict'),
        invalid('verdict-invalid', { ...good, verdict: marker }, 'invalid-verdict', 'verdict'),
        invalid('reason-type', { ...good, reason: null }, 'invalid-type', 'reason'),
        invalid('missing-type', { ...good, missing: 0 }, 'invalid-type', 'missing'),
        invalid('missing-null-inconclusive', { ...unknown, missing: null }, 'invalid-type', 'missing'),
        invalid('missing-string-conclusive', { ...good, missing: marker }, 'missing-must-be-null', 'missing'),
        invalid('citations-type', { ...good, citations: 'E1' }, 'invalid-type', 'citations'),
        invalid('citation-type', { ...good, citations: [3] }, 'invalid-type', 'citations[0]'),
        invalid('citation-required', { ...good, citations: [] }, 'citation-required', 'citations'),
        invalid('citation-foreign', { ...good, citations: [marker] }, 'citation-foreign', 'citations[0]'),
        invalid('citation-duplicate', { ...good, citations: ['E1', 'E1'] }, 'citation-duplicate', 'citations[1]'),
    ];
    for (const field of ['verdict', 'citations', 'missing']) {
        const response = { ...good };
        delete response[field];
        rows.push(invalid('missing-' + field, response, 'missing-field', field));
    }
    for (const [field, limit] of Object.entries(limits)) {
        const base = field === 'reason' ? good : unknown;
        rows.push(invalid(field + '-blank', { ...base, [field]: ' \t ' }, 'empty-text', field));
        for (const [label, separator] of [['LF', '\n'], ['CR', '\r'], ['CRLF', '\r\n'], ['NEL', '\u0085'],
            ['LS', '\u2028'], ['PS', '\u2029'], ['VT', '\v'], ['FF', '\f']]) {
            rows.push(invalid(field + '-' + label, { ...base, [field]: marker + separator + 'next' }, 'line-break', field));
        }
        for (const [encoding, char] of [['ascii', 'a'], ['two-byte', 'é'], ['four-byte', '🦊']]) {
            const boundary = char.repeat(limit / Buffer.byteLength(char, 'utf8'));
            assert.equal(Buffer.byteLength(boundary, 'utf8'), limit);
            rows.push({ name: field + '-' + encoding + '-limit', response: { ...base, [field]: boundary } });
            rows.push(invalid(field + '-' + encoding + '-limit-plus-one', { ...base, [field]: boundary + 'a' },
                'byte-limit', field, { bytes: limit + 1, limit }));
        }
    }
    return rows;
}

async function main() {
    const [labArg, archivesArg] = process.argv.slice(2);
    assert(labArg && archivesArg);
    const lab = path.resolve(labArg), archives = path.resolve(archivesArg);
    const subjects = fixtures(lab, archives);
    const packets = Object.fromEntries(Object.entries(subjects).map(([subject, session]) => [subject, prepare(subject, session, archives)]));
    const cases = {};
    let simulatedCalls = 0;
    for (const [subject, packet] of Object.entries(packets)) {
        const { session, proofs } = packet;
        const current = message(model, packet);
        const previous = oldMessage(model, packet);
        assert.equal(current.facts.packetSha256, previous.facts.packetSha256);
        assert.deepEqual(current.facts.aliases, previous.facts.aliases);
        assert(current.request.prompt.includes(`at most ${limits.reason} UTF-8 bytes`));
        assert(current.request.prompt.includes(`at most ${limits.missing} UTF-8 bytes`));
        assertStrictOutputSchema(current.request.options.schema);
        const validate = new Ajv().compile(current.request.options.schema);
        assert(validate(good) && validate(unknown));
        assert(validate({ ...good, reason: 'é'.repeat(701) }), 'transport schema is not the byte validator');
        assert(!validate({ ...good, [marker]: marker }));
        assert(!validate({ ...good, citations: [marker] }));
        const rows = [];
        for (const { name, response, expected } of examples()) {
            const journal = [];
            const result = await trial(model, packet, event => journal.push(event), async (request, mode, cwd, deadline) => {
                simulatedCalls++;
                assert.deepEqual(request, current.request);
                assert.equal(mode, 'closed');
                assert.equal(cwd, null);
                assert.equal(deadline, 42000);
                return { response, fact: { outcome: 'completed', turnCompletions: 1, inspections: 0, toolTypes: [],
                    usage: { input_tokens: 5000, output_tokens: 100 }, promptSha256: digest(request.prompt),
                    schemaSha256: digest(JSON.stringify(request.options.schema)) } };
            });
            assert.deepEqual(result.writeAttempts, []);
            assert.equal(result.budget, 'within');
            assert.equal(journal.filter(event => event.event === 'attempt-started').length, 1);
            if (expected) {
                assert.deepEqual(result.failure, expected, name);
                assert.equal(result.answer, null);
                assert.deepEqual(journal.at(-1), { event: 'rejected', failure: expected });
                assert(!JSON.stringify({ result, journal }).includes(marker));
                for (const field of ['reason', 'missing']) {
                    const value = response?.[field];
                    if (typeof value === 'string' && value.length > 800) assert(!JSON.stringify({ result, journal }).includes(value));
                }
            } else {
                assert.equal(result.failure, null);
                assert.deepEqual(result.answer.anchor, session.identity.anchor);
                assert.equal(result.answer.tree, session.identity.tree);
                assert.equal(result.answer.candidate, session.identity.candidate);
                assert.deepEqual(result.answer.receiptIds, response.citations.map(alias => current.facts.aliases[alias]));
            }
            rows.push({ name, failure: result.failure, budget: result.budget, writeAttempts: result.writeAttempts });
        }
        const wrong = packets[subject === 'original' ? 'mutant' : 'original'].proofs[0];
        for (const [proof, code] of [[wrong, 'receipt-revision'],
            [receipt({ ...session.identity, candidate: 'different' }, proofs[0]), 'receipt-identity'],
            [receipt({ ...session.identity, operation: 'different' }, proofs[0]), 'receipt-identity']]) {
            assert.throws(() => bindReply(good, session, [proof]), error => {
                assert.deepEqual(error.diagnostic, { code, field: 'citations[0]' });
                return true;
            });
        }
        const trap = await trial(model, packet, () => {}, () => assert.fail('unexpected transport'), 'publish');
        assert.equal(trap.failure.code, 'dry-run-write-port');
        assert.deepEqual(trap.writeAttempts, ['publishReview']);
        cases[subject] = { identity: session.identity, message: current.facts, rows };
    }
    const baseline = 'c66403a95079360d5e50ba421de8d14c80bcd1ee';
    const ledgerPath = 'quality/bugbot/evidence/issue-950/coverage-895-lifecycle-diagnostic/trials.jsonl';
    const ledger = execFileSync('git', ['-C', __dirname, '--no-replace-objects', 'show', baseline + ':' + ledgerPath],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const historical = ledger.trim().split('\n').map(JSON.parse).filter(row => row.event === 'result'
        && row.failure?.code === 'final-response-shape').map(row => ({ trial: row.trial, failure: row.failure, predicate: 'undetermined' }));
    assert.equal(historical.length, 2);
    console.log(JSON.stringify({ limits, simulatedCalls, modelCalls: 0, writeAttempts: 0, historicalLedgerSha256: digest(ledger),
        historical, cases }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
