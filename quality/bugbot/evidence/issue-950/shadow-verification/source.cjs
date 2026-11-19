'use strict';

const path = require('node:path');
const plan = require('./plan.json');
const official = require('../shadow-real-prs/official.json');

function fixtureSource(lab, subject, catalog = official) {
    return { repo: path.join(lab, subject.repository.split('/')[1] + '.git'),
        officialDirectory: lab, catalog, localRuntime: plan.localRuntime };
}

module.exports = { fixtureSource };
