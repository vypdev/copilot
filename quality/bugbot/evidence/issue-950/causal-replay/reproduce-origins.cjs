'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { git } = require('../on-demand/contract.cjs');
const { alternateEntry, fixture, request } = require('./inspection-fixture.cjs');

const pinned = '2d1d92c22bc423d7208357da9097cc07b937745a';

test('the reference ignores a reachable factory argument when another call matches the annotation', t => {
    assert(process.env.BUGBOT_CAUSAL_REFERENCE, 'Set BUGBOT_CAUSAL_REFERENCE to the pinned reference checkout.');
    const checkout = path.resolve(process.env.BUGBOT_CAUSAL_REFERENCE);
    assert.equal(git(checkout, 'rev-parse', 'HEAD').trim(), pinned);
    assert.equal(git(checkout, 'status', '--porcelain', '--untracked-files=no'), '');
    const { retrieve } = require(path.join(checkout, 'quality/bugbot/evidence/issue-950/causal-replay/retrieve.cjs'));
    const { cwd, binding, options } = fixture(t, alternateEntry('AlphaDatabase()'));
    const result = retrieve(cwd, binding, request, options);
    const implementation = result.links?.find(link => link.role === 'implementation')?.symbol;
    assert.deepEqual({ status: result.status, implementation }, { status: 'provided', implementation: 'BetaRepo.active_key' });
    console.log(JSON.stringify({ baseline: pinned, status: result.status, implementation }));
});
