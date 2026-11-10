'use strict';

const assert = require('node:assert/strict');
const { validateProof } = require('../coverage-895-pilot/runner.cjs');
const { read } = require('../git-path-pattern/adapter.cjs');

const target = (scope, match, query, start = null, end = null) => ({ scope, workspace: null, match, query, start, end });

function prepared(session) {
    const outcome = read(session.cwd, session.identity, {
        revision: 'head', kind: 'searchTree', targets: [
            target('', 'name', 'vitest.config.ts'),
        ],
    });
    // Exact bounded reads for the two additional material premises.
    const readLines = (path, start, end) => read(session.cwd, session.identity, {
        revision: 'head', kind: 'readBlob', targets: [target(path, 'lines', null, start, end)],
    });
    const extras = [outcome, readLines('tooling/coverage.mjs', 1, 2), readLines('package.json', 11, 11)].flatMap(entry => {
        assert.equal(entry.admission.status, 'admitted');
        assert.equal(entry.result.status, 'provided');
        assert.equal(entry.result.receipts.length, 1);
        return entry.result.receipts;
    });
    const proofs = [...session.initial, ...extras];
    for (const proof of proofs) validateProof(session, proof);
    return { proofs, status: { status: 'provided' }, origin: 'prepared' };
}

module.exports = { prepared };
