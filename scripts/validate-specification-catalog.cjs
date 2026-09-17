#!/usr/bin/env node

const validator = require('../src/infrastructure/specification_catalog_validator.cjs');

if (require.main === module) validator.main();

module.exports = validator;
