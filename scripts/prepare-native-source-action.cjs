const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SOURCE_ACTION = './../.copilot-native-runtime';
const FIXTURE_ACTION = './../.copilot-native-fixture-runtime';
const RECEIPT = '.copilot-runtime-snapshot.json';

function prepareNativeSourceAction(workspace, fixture = false) {
  workspace = fs.realpathSync(workspace);
  const target = path.resolve(workspace, fixture ? FIXTURE_ACTION : SOURCE_ACTION);
  const receipt = path.join(target, RECEIPT);
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Native runtime snapshot path is not an owned directory.');
    let previous;
    try { previous = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch { throw new Error('Native runtime snapshot directory is not owned by Copilot.'); }
    if (previous?.kind !== 'copilot-native-runtime' || previous.workspace !== workspace) throw new Error('Native runtime snapshot ownership does not match.');
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.mkdirSync(target, { mode: 0o700 });
  const source = fixture ? path.join(workspace, '.github/actions/copilot-native-fixture') : workspace;
  const files = fixture ? ['action.yml', 'dist/index.js'] : ['action.yml', 'build/github_action/index.js'];
  const hashes = {};
  for (const file of files) {
    const from = path.join(source, file);
    if (!fs.lstatSync(from).isFile() || fs.lstatSync(from).isSymbolicLink()) throw new Error('Native runtime source must be a regular file.');
    const data = fs.readFileSync(from);
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(target, file), data, { mode: 0o600, flag: 'wx' });
    hashes[file] = crypto.createHash('sha256').update(data).digest('hex');
  }
  if (!fixture && fs.existsSync(path.join(workspace, 'setup'))) fs.cpSync(path.join(workspace, 'setup'), path.join(target, 'setup'), { recursive: true, dereference: false });
  fs.writeFileSync(receipt, JSON.stringify({ kind: 'copilot-native-runtime', workspace, hashes }), { mode: 0o600, flag: 'wx' });
  return target;
}

if (require.main === module) {
  const target = prepareNativeSourceAction(process.cwd(), process.argv.includes('--fixture'));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `path=${target}\n`);
}
module.exports = { prepareNativeSourceAction, SOURCE_ACTION, FIXTURE_ACTION };
