'use strict';

const runtime = require('../../../../../src/infrastructure/bugbot/shadow/run.cjs');
const { fixtureSource } = require('./source.cjs');

function investigate(lab, subject, ...args) {
    return runtime.investigate(fixtureSource(lab, subject), subject, ...args);
}

module.exports = { investigate };
