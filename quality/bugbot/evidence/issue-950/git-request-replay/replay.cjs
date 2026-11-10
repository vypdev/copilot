'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { assertStrictOutputSchema } = require('../../../../../src/application/policies/agent_execution/strict_output_schema_policy.ts');
const { git } = require('../on-demand/contract.cjs');
const { digest } = require('../v4/verification.cjs');
const { fixtures } = require('../coverage-895-pilot/fixture.cjs');
const { trial } = require('../coverage-895-pilot/runner.cjs');
const { lineRead } = require('../detector-verifier-diagnostic/runner.cjs');
const { sourceLimits } = require('../packet-audit/git-evidence.cjs');
const { packetBytes, promptBytes, models } = require('../coverage-895-pilot/manifest.json');
const adapter = require('./adapter.cjs');
const { initialRequest, replay } = require('./runner.cjs');

const baseline = '10c9e80aab89f89648dab34bf69aef9b8072b4ac';
const historyPath = 'quality/bugbot/evidence/issue-950/coverage-895-pilot/trials.jsonl';
const historical = path.resolve(__dirname, '../coverage-895-pilot');
const frozen = require('../coverage-895-reserved/dependency-control.json');
const ajv = new Ajv();
const verdict = citations => ({ verdict: 'inconclusive', citations, reason: 'Simulated receipt delivery.',
    missing: 'Run the separate model diagnostic.' });

function historicalRequests() {
    for (const line of fs.readFileSync(path.join(historical, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [sha, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(historical, file))), sha, file);
    }
    const ledger = execFileSync('git', ['-C', __dirname, '--no-replace-objects', 'show', `${baseline}:${historyPath}`],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    assert.equal(ledger, fs.readFileSync(path.join(historical, 'trials.jsonl'), 'utf8'));
    const requests = ledger.trim().split('\n').map(JSON.parse).filter(event => event.event === 'request');
    assert.equal(requests.length, 17);
    assert.equal(requests.filter(row => row.model === 'gpt-6.1-sol').length, 16);
    return { requests, ledgerSha256: digest(ledger) };
}

async function reproduceBaseline(requests, sessions) {
    const results = new Map();
    for (const row of requests) {
        let calls = 0;
        const result = await trial(row, sessions[row.subject], () => {}, async request => ({
            response: calls++ === 0 ? { decision: null, request: row.requested } : verdict(['E1']),
            fact: { outcome: 'completed', turnCompletions: 1, inspections: 0, toolTypes: [],
                usage: { input_tokens: 5000, output_tokens: 100 },
                promptSha256: digest(request.prompt), schemaSha256: digest(JSON.stringify(request.options.schema)) },
        }));
        assert.equal(result.failure, null);
        assert.deepEqual(result.admission, row.admission);
        assert.equal(result.sourceUsage.openedFiles, 0);
        assert.deepEqual(result.retrieved, []);
        assert.deepEqual(result.writeAttempts, []);
        results.set(row.trial, { admission: result.admission, git: null, writeAttempts: result.writeAttempts });
    }
    return results;
}

function decisive(subject, receipts) {
    const required = subject === 'original' ? [12, 14] : [12, 13, 14, 15, 16, 17, 18, 19, 20, 23];
    return required.every(line => receipts.some(proof => proof.path === 'vitest.config.ts' && proof.start <= line && line <= proof.end));
}

function simulatedReplay(row, session, schema) {
    let turns = 0;
    const schemaAccepted = schema({ decision: null, request: row.requested });
    const output = replay(row, session, request => {
        assert.equal(request.configuration.model, row.model);
        const packet = JSON.parse(request.prompt.split('\n').at(-1));
        assert.equal(packet.provenance.head, session.identity.head);
        assert.equal(packet.provenance.tree, session.identity.tree);
        assert.equal(packet.provenance.operation, session.identity.operation);
        assert.equal(packet.provenance.lockBlob, session.identity.lockBlob);
        assert.deepEqual(packet.candidate.anchor, session.identity.anchor);
        if (turns++ === 0) {
            assert.equal(packet.sources.length, 13);
            assert(!request.prompt.includes('vitest.config.ts'));
            return { decision: null, request: row.requested };
        }
        assert.equal(turns, 2);
        assert.equal(packet.sources.filter(source => source.kind === 'dependency').length, 10);
        assert.deepEqual(packet.provenance.resolutions, session.resolutions);
        assert.deepEqual(request.options.schema.properties.citations.items.enum, packet.sources.map(source => source.alias));
        assert(packet.retrieval);
        return verdict(packet.sources.map(source => source.alias));
    });

    assert.equal(turns, output.delivery?.status === 'delivered' ? 2 : 1);
    assert.deepEqual(output.original, row.requested);
    assert.deepEqual(output.writeAttempts, []);
    const receipts = output.git?.receipts ?? [];
    if (output.delivery?.status === 'delivered') {
        const { delivery } = output;
        assert(delivery.packetBytes <= packetBytes && delivery.promptBytes <= promptBytes);
        assert.deepEqual(delivery.citedReceiptIds, Object.values(delivery.aliases));
        for (const proof of receipts) assert(delivery.citedReceiptIds.includes(proof.id));
    }
    const { cwd, identity } = session;
    for (const proof of receipts) {
        const locator = identity.head + ':' + proof.path;
        assert.equal(git(cwd, '--no-replace-objects', 'rev-parse', locator).trim(), proof.blob);
        const lines = git(cwd, '--no-replace-objects', 'show', locator).replace(/\r\n/gu, '\n').replace(/\n$/u, '').split('\n');
        assert.equal(digest(lines.slice(proof.start - 1, proof.end).join('\n')), proof.artifact);
        assert.equal(proof.head, identity.head);
        assert.equal(proof.tree, identity.tree);
        assert.equal(proof.candidate, identity.candidate);
        assert.equal(proof.operation, identity.operation);
    }
    const recovered = decisive(row.subject, receipts);
    const delivered = decisive(row.subject, receipts.filter(proof => output.delivery?.citedReceiptIds?.includes(proof.id)));
    return { ...output, schemaAccepted, simulatedTurns: turns, decisive: { recovered, delivered } };
}

const search = (scope, query, match = 'name') => ({ kind: 'searchTree', revision: 'head',
    targets: [{ scope, workspace: null, match, query, start: null, end: null }] });

function controls(sessions) {
    const cases = {}, schemas = {};
    for (const [subject, session] of Object.entries(sessions)) {
        const first = initialRequest(models[0], session);
        assert.deepEqual(initialRequest(models[1], session).facts, first.facts);
        assert.equal(first.facts.packetSha256, require('../coverage-895-pilot/runner-control.json').cases[subject].initial.packetSha256);
        assertStrictOutputSchema(first.request.options.schema);
        const schema = ajv.compile(first.request.options.schema);
        const valid = request => schema({ decision: null, request });
        const row = { subject, model: models[0] };
        const explicit = lineRead('vitest.config.ts', 1, subject === 'original' ? 15 : 24);
        const exact = search('.', 'vitest.config.ts');
        const partial = { ...exact, targets: [...exact.targets, ...search('.', 'absent-fixture-895.txt').targets] };
        const absent = search('.', '*vitest*');
        const broad = search('.', 'completeCoverage', 'literal');
        const overBytes = lineRead('docs/checkbox-contract.md', 1, 74);
        const fixtureCases = { explicit, exact, partial, absent, broad, overBytes };
        for (const request of Object.values(fixtureCases)) assert(valid(request));
        const samples = Object.fromEntries(Object.entries(fixtureCases).map(([name, requested]) =>
            [name, simulatedReplay({ ...row, requested }, session, schema)]));
        for (const name of ['explicit', 'exact', 'partial']) {
            assert.deepEqual(samples[name].decisive, { recovered: true, delivered: true });
            assert.deepEqual(samples[name].git.receipts.map(p => p.id), [frozen.cases[subject].recoveredSource]);
        }
        assert.equal(samples.explicit.git.status, 'provided');
        assert.equal(samples.exact.git.status, 'provided');
        assert.equal(samples.partial.git.status, 'partial');
        assert.equal(samples.absent.git.status, 'absent');
        assert.equal(samples.broad.git.results[0].reason, 'search-file-budget');
        assert.equal(samples.overBytes.git.status, 'budget');
        assert.equal(samples.overBytes.git.results[0].reason, 'fragment-byte-budget');
        assert.deepEqual(samples.overBytes.git.receipts, []);

        const subdirectory = { ...session.identity, scopes: ['tooling'] };
        for (const root of ['.', '']) {
            const result = adapter.read(session.cwd, subdirectory, search(root, 'coverage.mjs'));
            assert.deepEqual(result.normalized, search(root, 'coverage.mjs'));
            assert.equal(result.admission.reason, 'scope-denied');
            assert.equal(result.result, null);
        }
        assert.equal(adapter.read(session.cwd, subdirectory, search('tooling', 'coverage.mjs')).admission.status, 'admitted');
        for (const scope of ['/tooling', 'C:/tooling', '..', '../tooling', 'tooling/../tests', '.git',
            '.git/config', 'tooling/.GIT/config', './tooling']) {
            const result = adapter.read(session.cwd, session.identity, search(scope, 'coverage.mjs'));
            assert.equal(result.admission.reason, 'scope-denied');
            assert.equal(result.result, null);
        }
        for (const query of ['../coverage.mjs', '/coverage.mjs', '.git', 'tooling/coverage.mjs', 'tooling\\coverage.mjs']) {
            const result = adapter.read(session.cwd, session.identity, search('.', query));
            assert.equal(result.admission.reason, 'request-shape');
            assert.equal(result.result, null);
        }
        const dotRead = adapter.admit(lineRead('.', 1, 1), session.identity.scopes);
        assert.equal(dotRead.admission.reason, 'scope-denied');
        assert.equal(dotRead.normalized.targets[0].scope, '.');
        assert(!valid({ ...explicit, targets: [...explicit.targets, ...explicit.targets] }));
        assert(!valid({ ...exact, targets: Array(4).fill(exact.targets[0]) }));
        assert(!valid({ ...exact, targets: explicit.targets }));
        assert(!valid({ ...explicit, targets: exact.targets }));
        assert(!valid(search('.', 'tooling/coverage.mjs')));
        assert(valid(search('.', 'tooling/coverage.mjs', 'literal')));
        assert(!valid(lineRead('vitest.config.ts', 0, 1)));
        assert.equal(adapter.admit(lineRead('vitest.config.ts', 2, 81), session.identity.scopes).admission.status, 'admitted');
        assert.equal(adapter.admit(lineRead('vitest.config.ts', 2, 1), session.identity.scopes).admission.reason, 'request-shape');
        assert.equal(adapter.admit(lineRead('vitest.config.ts', 1, 81), session.identity.scopes).admission.reason, 'line-budget');
        assert.deepEqual([sourceLimits.lines, sourceLimits.fragmentBytes, sourceLimits.maxTargets], [80, 4400, 3]);
        cases[subject] = { first: first.facts, samples };
        schemas[subject] = schema;
    }
    return { cases, schemas };
}

async function main() {
    const [lab, archives] = process.argv.slice(2);
    assert(lab && archives);
    const { requests, ledgerSha256 } = historicalRequests();
    const sessions = fixtures(path.resolve(lab), path.resolve(archives));
    const old = await reproduceBaseline(requests, sessions);
    const { cases, schemas } = controls(sessions);
    const trials = requests.map(row => {
        const session = sessions[row.subject];
        const after = simulatedReplay(row, session, schemas[row.subject]);
        assert.equal(after.schemaAccepted, row.model === 'gpt-6.1-sol');
        return { trial: row.trial, subject: row.subject, model: row.model, arm: row.arm,
            execution: row.arm === 'on-demand' ? 'on-demand-replay' : 'counterfactual-control',
            before: old.get(row.trial), after };
    });
    assert.equal(trials.filter(row => row.after.admission.status === 'admitted').length, 16);
    const summary = { requests: trials.length, priorDenials: old.size,
        admitted: trials.filter(row => row.after.admission.status === 'admitted').length,
        decisiveRecovered: trials.filter(row => row.after.decisive.recovered).length,
        decisiveDelivered: trials.filter(row => row.after.decisive.delivered).length,
        modelCalls: 0, writeAttempts: trials.flatMap(row => [...row.before.writeAttempts, ...row.after.writeAttempts]).length };
    console.log(JSON.stringify({ baseline, ledgerSha256, summary, controls: { cases, passed: [
        'strict-schema', 'root-alias', 'authorized-subdirectory-only', 'path-escapes', 'no-blob-root-alias',
        'one-line-read-target', 'three-search-targets', 'separate-search-modes', 'ordered-inclusive-range', 'effective-caps',
        'exact-name', 'partial-delivery', 'wildcard-is-literal', 'search-file-budget', 'fragment-byte-budget',
    ] }, trials }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
