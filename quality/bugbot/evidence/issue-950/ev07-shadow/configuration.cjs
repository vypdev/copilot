'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');

// This local evaluation input is frozen in the campaign preregistration.
// It is not a Copilot Action or consumer repository setting.
const file = process.env.COPILOT_EV07_PLAN
    ? path.resolve(process.env.COPILOT_EV07_PLAN) : path.join(__dirname, 'plan.json');

module.exports = JSON.parse(readFileSync(file, 'utf8'));
