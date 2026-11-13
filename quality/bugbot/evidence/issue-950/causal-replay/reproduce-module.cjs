'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');
const { git } = require('../on-demand/contract.cjs');
const { fixture, moduleAlias, request } = require('./inspection-fixture.cjs');

const baseline = '580811b61175c4084940004349cd708f1a22e8e8';

test('the pinned resolver confuses the import with the module alias used at runtime', t => {
    const reference = path.resolve(process.env.BUGBOT_CAUSAL_REFERENCE);
    assert.equal(git(reference, 'rev-parse', 'HEAD').trim(), baseline);
    assert.equal(git(reference, 'status', '--porcelain', '--untracked-files=no'), '');
    const { retrieve } = require(path.join(reference, 'quality/bugbot/evidence/issue-950/causal-replay/retrieve.cjs'));
    const { cwd, binding, options } = fixture(t, moduleAlias('AlphaDatabase'));
    const observed = execFileSync('python3', ['-B', '-c',
        'from pkg.composition.runtime import create; print(type(create().store).__name__)'], { cwd, encoding: 'utf8' }).trim();
    const result = retrieve(cwd, binding, request, options);
    const implementation = result.links?.find(link => link.role === 'implementation')?.symbol;
    assert.deepEqual({ observed, status: result.status, implementation },
        { observed: 'AlphaDatabase', status: 'provided', implementation: 'BetaRepo.active_key' });
    console.log(JSON.stringify({ baseline, observed, status: result.status, implementation }));
});
