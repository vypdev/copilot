'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const revisions = Object.freeze({
    1: Object.freeze({ path: 'quality/bugbot/corpus.v1.json', sha256: '640c3355aeb65c1b15454bd7f9242fa36acc12b8b3f5ef284ee06af8af36c6c6', version: 1 }),
    2: Object.freeze({ path: 'quality/bugbot/corpus.v2.json', sha256: '001223aa255e5af7e10bddab2c8deacd7cacf0b5b3690a5a2034d241274cb9d6', version: 2 }),
});

function requireCorpusSelection(plan) {
    assert(plan.schemaVersion === 1 || plan.schemaVersion === 2, 'unsupported qualification plan version');
    const selected = revisions[plan.schemaVersion];
    assert.equal(plan.corpus?.sha256, selected.sha256, 'qualification independent corpus provenance');
    assert.equal(plan.corpus.cases, 174, 'qualification requires all 174 independent cases');
    if (plan.schemaVersion === 2) {
        assert.equal(plan.lifecycle, 'qualification-investigation-v1', 'v2 requires the trusted research lifecycle');
        assert.equal(plan.corpus.path, selected.path, 'explicit v2 corpus path required');
        assert.equal(plan.corpus.version, 2, 'explicit v2 corpus revision required');
        assert.equal(plan.corpus.outerAttemptsPerCase, 1, 'one outer attempt per case');
        assert(Number.isInteger(plan.corpus.concurrency) && plan.corpus.concurrency >= 1 && plan.corpus.concurrency <= 6,
            'preregister one to six corpus workers');
    } else {
        assert(plan.corpus.path === undefined || plan.corpus.path === selected.path, 'v1 cannot redirect its corpus');
        assert(plan.corpus.version === undefined || plan.corpus.version === 1, 'v1 cannot redirect its revision');
    }
    return selected;
}

function selectedCorpus(plan, root) {
    const selection = requireCorpusSelection(plan), file = path.join(root, selection.path);
    assert(fs.lstatSync(file).isFile(), 'corpus must be a regular file');
    const bytes = fs.readFileSync(file);
    assert.equal(hash(bytes), selection.sha256, 'selected corpus bytes differ');
    const inventory = JSON.parse(bytes);
    assert.equal(inventory.cases.length, 174, 'selected corpus must retain all cases');
    assert.equal(new Set(inventory.cases.map(row => row.id)).size, 174, 'corpus identities must be unique');
    if (selection.version === 2) {
        const originalBytes = fs.readFileSync(path.join(root, revisions[1].path));
        assert.equal(hash(originalBytes), revisions[1].sha256, 'historical corpus bytes differ');
        const original = JSON.parse(originalBytes);
        assert.deepEqual(inventory.cases.map(row => row.id), original.cases.map(row => row.id), 'corpus order changed');
        for (let index = 0; index < original.cases.length; index++) {
            const before = original.cases[index], after = inventory.cases[index];
            assert.deepEqual(before.id === 'actions-readonly-metadata' ? { ...after, diff: before.diff } : after, before,
                'only the independently justified #985 diff may change');
        }
    }
    return { selection, file, inventory };
}

module.exports = { requireCorpusSelection, selectedCorpus };
