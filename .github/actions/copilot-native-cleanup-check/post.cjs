const fs = require('node:fs');
const path = require('node:path');
const workspace = process.env.STATE_workspace;
// Keep the poisoned candidate bundle through every deferred post step, then remove
// only this job's ignored generated fixture output so subsequent runs start clean.
fs.rmSync(path.join(workspace, '.github/actions/copilot-native-fixture/dist'), { recursive: true, force: true });
for (const file of [path.join(workspace, '.git/copilot-verification-setup'), path.join(path.dirname(workspace), '.copilot-native-fixture-runtime')]) {
  if (fs.existsSync(file)) throw new Error('Native acceptance left owned staging or runtime snapshots after post cleanup.');
}
console.log('Native acceptance cleanup passed after all deferred post steps.');
