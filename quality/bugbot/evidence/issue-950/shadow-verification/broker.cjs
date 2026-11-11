'use strict';

const runtime = require('../../../../../src/infrastructure/bugbot/shadow/broker.cjs');
const { fixtureSource } = require('./source.cjs');

function makeBroker(lab, subject, finding, catalog) {
    return runtime.makeBroker(fixtureSource(lab, subject, catalog), subject, finding);
}

module.exports = { makeBroker, officialPackage: runtime.officialPackage };
