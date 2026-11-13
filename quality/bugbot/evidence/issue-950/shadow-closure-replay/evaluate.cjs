'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { git } = require('../shadow-real-prs/broker.cjs');
const { hash } = require('../shadow-real-prs/session.cjs');
const official = require('../shadow-real-prs/official.json');
const { localRuntime } = require('../shadow-verification/plan.json');

const checks = {
    24: { expected: 'refuted', ranges: [
        { name: 'exact parent index', path: 'backend/src/domus/infrastructure/sqlite_task_schema.py', first: 5, last: 5 },
        { name: 'index before profile schema', path: 'backend/src/domus/infrastructure/sqlite.py', first: 97, last: 101 },
        { name: 'version-matched official unique index rule', package: 'sqlite', first: 230, last: 233 },
    ] },
    29: { expected: 'confirmed', ranges: [
        { name: 'early invalid-input return', path: 'frontend/src/application/task-controller.ts', first: 132, last: 132 },
        { name: 'receipt-driven form clear', path: 'frontend/src/presentation/domus-tasks.ts', first: 73, last: 75 },
    ] },
};

function sourceText(lab, candidate, proof) {
    if (proof.kind === 'git') {
        const repo = path.join(lab, candidate.repository.name + '.git');
        assert.equal(git(repo, ['rev-parse', proof.sha + ':' + proof.path]).trim(), proof.blob);
        return git(repo, ['show', proof.sha + ':' + proof.path]);
    }
    if (proof.kind === 'runtime') {
        assert.equal(proof.version, localRuntime.sqlite);
        assert.equal(proof.versionScope, localRuntime.scope);
        return `Python ${localRuntime.python}; SQLite ${localRuntime.sqlite}; ${localRuntime.scope}`;
    }
    assert.equal(proof.kind, 'official');
    const entry = official.find(item => item.url === proof.url && item.version === proof.version);
    assert(entry, 'unknown source release');
    assert.equal(proof.versionScope, localRuntime.scope);
    const contents = fs.readFileSync(path.join(lab, entry.file));
    assert.equal(hash(contents), entry.sha256);
    return contents.toString('utf8');
}

function evaluate(lab, file) {
    const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const { candidate, configuration } = rows.find(row => row.event === 'replay-plan');
    const result = rows.find(row => row.event === 'finding-result');
    const completion = rows.find(row => row.event === 'replay-completed');
    assert.equal(result.head, candidate.headSha);
    assert.deepEqual(result.anchor, candidate.anchor);
    assert.deepEqual(result.writes, []);
    assert.deepEqual(completion.writes, []);
    assert(result.turns.every(turn => turn.resolvedModel === configuration.model));
    const session = result.turns[0]?.sessionSha256 ?? null;
    const { answer } = result;
    for (const proof of answer?.citations ?? []) {
        assert.equal(proof.sha, candidate.headSha);
        const lines = sourceText(lab, candidate, proof).split(/\r?\n/u);
        assert.equal(hash(lines.slice(proof.first - 1, proof.last).join('\n')), proof.textSha256);
        assert(result.actions.some(action => action.result.sources?.some(source =>
            source.receipt === proof.receipt && source.first <= proof.first && source.last >= proof.last)));
    }
    const { expected, ranges } = checks[candidate.pullRequest];
    return { file: path.basename(file), model: configuration.model, head: result.head, session,
        observed: answer?.label ?? null, expected, verdictMatches: answer?.label === expected,
        exactRanges: ranges.map(range => ({
            step: range.name,
            premises: (answer?.premises ?? []).flatMap(({ citations }, index) => citations.some(proof =>
                (range.path ? proof.path === range.path : proof.package === range.package && proof.kind === 'official')
                && proof.first <= range.first && proof.last >= range.last) ? [index + 1] : []),
        })),
        validatedCitations: answer?.citations.length ?? 0, writes: result.writes.length,
        closures: result.closures.length, wallMs: result.wallMs, missing: answer?.missing ?? null,
        failure: result.failure };
}

const [lab, ...files] = process.argv.slice(2);
assert(files.length);
const results = files.map(file => evaluate(lab, file));
const sessions = results.map(result => result.session).filter(Boolean);
assert.equal(new Set(sessions).size, sessions.length);
console.log(JSON.stringify(results, null, 2));
