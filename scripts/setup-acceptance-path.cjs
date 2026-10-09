const path = require('node:path');

/** Match Jest's absolute suite path to the repository-relative ledger on any host. */
function relativeJestSuitePath(root, suite, pathApi = path) {
  return pathApi.relative(root, suite).split(pathApi.sep).join('/');
}

module.exports = { relativeJestSuitePath };
