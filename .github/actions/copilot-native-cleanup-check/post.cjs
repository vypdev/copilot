const fs = require('node:fs');
const path = require('node:path');
const workspace = process.env.STATE_workspace;
for (const file of [path.join(workspace, '.git/copilot-verification-setup'), path.join(path.dirname(workspace), '.copilot-native-fixture-runtime')]) {
  if (fs.existsSync(file)) throw new Error('Native acceptance left owned staging or runtime snapshots after post cleanup.');
}
console.log('Native acceptance cleanup passed after all deferred post steps.');
