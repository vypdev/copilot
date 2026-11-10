'use strict';

const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const Ajv = require('ajv');
const { assertStrictOutputSchema } = require('../../../../../src/application/policies/agent_execution/strict_output_schema_policy.ts');
const { fixtures } = require('../coverage-895-pilot/fixture.cjs');
const { models } = require('../coverage-895-pilot/manifest.json');
const { initialRequest } = require('../git-request-replay/runner.cjs');
const { historicalRequests, simulatedReplay } = require('../git-request-replay/replay.cjs');
const previous = require('../git-request-replay/replay.json');
const adapter = require('./adapter.cjs');
const { retrieve, sourceLimits } = require('./git-evidence.cjs');
const { matchPath, patternBytes } = require('./path-pattern.cjs');

function search(match, query, scope = '.', workspace = null) {
    return { kind: 'searchTree', revision: 'head', targets: [{ scope, workspace, match, query, start: null, end: null }] };
}

const byPath = (pattern, scope) => search('pathPattern', pattern, scope);
const filtered = (text, pathPattern, scope) => search('literal', { text, pathPattern }, scope);
const summarize = ({ original, admission, git }) => ({ original, admission,
    git: git ? { status: git.status, results: git.results, usage: git.usage } : null });

function budgetSnapshot(result) {
    const { elapsedMs, ...budget } = result.budget;
    assert(elapsedMs <= sourceLimits.sourceWallMs);
    return { ...result, budget };
}

function controls(subject, session, schema) {
    const check = requested => simulatedReplay({ subject, requested, model: models[0] }, session, schema, adapter);
    const path = byPath('*vitest*');
    const literal = filtered('storybookTest(', '*vitest*');
    const positive = { pathPattern: check(path), filteredLiteral: check(literal) };
    for (const output of Object.values(positive)) {
        assert.equal(output.schemaAccepted, true);
        assert.equal(output.admission.status, 'admitted');
        assert.equal(output.git.status, 'provided');
        assert.equal(output.git.results[0].filteredPaths, 1);
        assert.equal(output.git.usage.openedFiles, 1);
        assert.equal(output.git.receipts.length, 1);
        assert.deepEqual(output.decisive, { recovered: true, delivered: true });
        assert.equal(output.delivery.status, 'delivered');
        assert.equal(output.delivery.citedReceiptIds.length, 14);
    }

    const empty = check(byPath('*no-matching-895-path*'));
    assert.equal(empty.git.status, 'absent');
    assert.equal(empty.git.results[0].filteredPaths, 0);
    assert.equal(empty.git.usage.openedFiles, 0);
    const budgetCases = [byPath('*/*/*'), filtered('storybookTest(', '*/*/*')].map(check);
    for (const output of budgetCases) {
        assert.equal(output.git.status, 'budget');
        assert.equal(output.git.results[0].reason, 'search-file-budget');
        assert(output.git.results[0].filteredPaths > sourceLimits.openedFiles);
        assert.equal(output.git.usage.openedFiles, 0);
        assert.deepEqual(output.git.receipts, []);
    }
    const failures = ['../*vitest*', 'tooling/../*vitest*', '/tmp/*vitest*', 'C:/tmp/*vitest*', '.git/*',
        'tooling/.GiT/*', 'tooling\\*', './*', '**/*', 'tooling//*.mjs'].flatMap(pattern =>
        [byPath(pattern), filtered('storybookTest(', pattern)].map(check));
    for (const output of failures) {
        assert.deepEqual(output.admission, { status: 'denied', reason: 'path-pattern-denied' });
        assert.equal(output.git, null);
        assert.equal(output.delivery, null);
    }
    const escapedScope = check(byPath('*vitest*', '../'));
    assert.equal(escapedScope.admission.reason, 'scope-denied');
    const scoped = { ...session, identity: { ...session.identity, scopes: ['tooling'] } };
    const scopeCheck = requested => simulatedReplay({ subject, requested, model: models[0] }, scoped, schema, adapter);
    const noRoot = scopeCheck(byPath('*vitest*'));
    assert.equal(noRoot.admission.reason, 'scope-denied');
    const restricted = scopeCheck(byPath('*vitest*', 'tooling'));
    assert.equal(restricted.git.results[0].filteredPaths, 0);
    assert.equal(restricted.git.usage.openedFiles, 0);
    const inside = scopeCheck(byPath('coverage.mj?', 'tooling'));
    assert.equal(inside.git.results[0].filteredPaths, 1);
    assert.equal(inside.git.usage.openedFiles, 1);
    assert.deepEqual(inside.git.receipts.map(proof => proof.path), ['tooling/coverage.mjs']);
    const outside = scopeCheck(byPath('../*vitest*', 'tooling'));
    assert.equal(outside.admission.reason, 'path-pattern-denied');

    const noWorkspace = search('pathPattern', '*vitest*', '.', 'sample');
    assert.equal(check(noWorkspace).admission.reason, 'pattern-workspace-denied');
    assert(!schema({ decision: null, request: noWorkspace }));
    assert(!schema({ decision: null, request: search('name', { text: 'x', pathPattern: '*' }) }));
    assert(!schema({ decision: null, request: search('literal', { text: 'x' }) }));
    assert.equal(check(search('literal', { text: 'x' })).admission.reason, 'request-shape');
    const bytes = check(byPath('é'.repeat(Math.floor(patternBytes / 2) + 1)));
    assert.equal(bytes.admission.reason, 'path-pattern-byte-budget');

    const { revision: _, ...query } = byPath('*vitest*', '');
    const truncated = retrieve(session.cwd, session.identity, query, { caps: { ...sourceLimits, treeEntries: 1 } });
    assert.equal(truncated.status, 'budget');
    assert.equal(truncated.results[0].reason, 'tree-entry-budget');
    assert.equal(truncated.budget.openedFiles, 0);
    const matches = retrieve(session.cwd, session.identity, { kind: 'searchTree', targets: byPath('*', '').targets },
        { caps: { ...sourceLimits, matches: 1 } });
    assert.equal(matches.status, 'budget');
    assert.equal(matches.results[0].reason, 'match-budget');
    assert.equal(matches.budget.openedFiles, 0);

    let clock = -sourceLimits.sourceWallMs;
    const deadline = retrieve(session.cwd, session.identity, query, { clock: () => (clock += sourceLimits.sourceWallMs) });
    assert.deepEqual(deadline, { status: 'expired', reason: 'source-deadline' });

    const ambiguous = check(byPath('*'));
    assert.equal(ambiguous.git.status, 'ambiguous');
    assert.equal(ambiguous.git.usage.openedFiles, 0);
    const mixed = check({ ...path, targets: [...path.targets, ...filtered('storybookTest(', '*/*/*').targets] });
    assert.equal(mixed.git.status, 'partial');
    assert.deepEqual(mixed.git.results.map(row => row.status), ['provided', 'budget']);
    assert.deepEqual(mixed.decisive, { recovered: true, delivered: true });
    const exact = check(search('name', 'vitest.config.ts'));
    assert.deepEqual(exact.decisive, { recovered: true, delivered: true });
    assert.deepEqual(exact.git.receipts, positive.pathPattern.git.receipts);
    const wildcardName = check(search('name', '*vitest*'));
    assert.equal(wildcardName.git.results[0].reason, 'path-absent');
    const separateControls = Object.fromEntries(Object.entries({ empty, escapedScope, noRoot, restricted, inside,
        outside, bytes, ambiguous, mixed, exact, wildcardName }).map(([name, output]) => [name, summarize(output)]));
    return { positive, separateControls: { ...separateControls, truncated: budgetSnapshot(truncated), matches: budgetSnapshot(matches), deadline,
        budgetCases: budgetCases.map(summarize), deniedPatterns: failures.map(summarize) } };
}

function main() {
    const [lab, archives] = process.argv.slice(2);
    assert(lab && archives);
    assert(matchPath('a/config-é.ts', ['a', 'config-?.ts'].map(s => [...s])));
    assert(matchPath('a/config-.ts', ['a', 'config-*.ts'].map(s => [...s])));
    assert(!matchPath('a/b/config-foo.ts', ['a', 'config-*.ts'].map(s => [...s])));
    assert(!matchPath('a/b-config.ts', ['*config*'].map(s => [...s])));

    const sessions = fixtures(resolve(lab), resolve(archives));
    const ajv = new Ajv();
    const schemas = {};
    const evidence = Object.fromEntries(Object.entries(sessions).map(([subject, session]) => {
        const initial = initialRequest(models[0], session, adapter);
        assert.deepEqual(initialRequest(models[1], session, adapter).facts, initial.facts);
        assert.equal(initial.facts.packetSha256, previous.controls.cases[subject].first.packetSha256);
        assertStrictOutputSchema(initial.request.options.schema);
        schemas[subject] = ajv.compile(initial.request.options.schema);
        return [subject, { initial: initial.facts, ...controls(subject, session, schemas[subject]) }];
    }));
    const { requests, ledgerSha256 } = historicalRequests();
    assert.equal(ledgerSha256, previous.ledgerSha256);
    const historical = requests.map((row, index) => {
        const output = simulatedReplay(row, sessions[row.subject], schemas[row.subject], adapter);
        const frozen = previous.trials[index];
        assert.equal(row.trial, frozen.trial);
        assert.deepEqual(output, frozen.after);
        return { trial: row.trial, unchanged: true, admission: output.admission, status: output.git?.status ?? null };
    });
    const positives = Object.values(evidence).flatMap(subject => Object.values(subject.positive));
    console.log(JSON.stringify({ reference: '98654c7f8a3bd527445998fd322f07917ab4c4b4', modelCalls: 0,
        newControls: positives.length, decisiveRecovered: positives.filter(row => row.decisive.recovered).length,
        decisiveDelivered: positives.filter(row => row.decisive.delivered).length,
        writeAttempts: 0, evidence, historical }, null, 2));
}

main();
