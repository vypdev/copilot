'use strict';

const assert = require('node:assert/strict');
const runtime = require('../../../../../src/infrastructure/bugbot/shadow/run.cjs');
const { preflight } = require('../shadow-real-prs/run.cjs');
const { fixtureSource } = require('./source.cjs');

function investigate(lab, subject, ...args) {
    return runtime.investigate(fixtureSource(lab, subject), subject, ...args);
}

if (require.main === module) {
    const [lab, mode] = process.argv.slice(2);
    assert.equal(mode, '--check');
    preflight(lab);
    console.log('Pinned subject trees, archived producer evidence and official sources checked.');
}
module.exports = { investigate };
