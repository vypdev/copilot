'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { git } = require('../on-demand/contract.cjs');
const { fixture, lateAssignment, request } = require('./inspection-fixture.cjs');

const pinned = '232b8eb3570728d5d2b8f0d7c7777e0ce96c32e5';
const reference = process.env.BUGBOT_CAUSAL_REFERENCE;

test('the reference incorrectly attributed an assignment after the constructor', t => {
    assert(reference, 'Set BUGBOT_CAUSAL_REFERENCE to a clean checkout of the reference commit.');
    const checkout = path.resolve(reference);
    assert.equal(git(checkout, 'rev-parse', 'HEAD').trim(), pinned);
    assert.equal(git(checkout, 'status', '--porcelain', '--untracked-files=no'), '');
    const { retrieve } = require(path.join(checkout, 'quality/bugbot/evidence/issue-950/causal-replay/retrieve.cjs'));
    const { cwd, binding, options } = fixture(t, lateAssignment);
    const result = retrieve(cwd, binding, request, options);
    const symbol = result.links?.find(link => link.role === 'implementation')?.symbol;
    assert.deepEqual({ status: result.status, symbol }, { status: 'provided', symbol: 'BetaRepo.active_key' });
    console.log(JSON.stringify({ baseline: pinned, status: result.status, symbol }));
});
