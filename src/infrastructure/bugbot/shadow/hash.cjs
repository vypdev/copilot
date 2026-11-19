'use strict';

const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');

module.exports = { hash };
