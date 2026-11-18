'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const configuration = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
assert.equal(configuration.error, undefined, 'shipping TypeScript configuration unavailable');
const converted = ts.convertCompilerOptionsFromJson(configuration.config.compilerOptions, root);
assert.deepEqual(converted.errors, [], 'shipping compiler options invalid');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: converted.options,
}).outputText, filename);
