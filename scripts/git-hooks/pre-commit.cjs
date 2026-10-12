/**
 * Pre-commit hook: run build, test, and lint before allowing a commit.
 * Cross-platform (Windows, macOS, Linux). Invoked by the pre-commit shell launcher.
 * On Windows, Git for Windows runs the launcher with Bash, which then runs this script with Node.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const { createVerificationEnvironment } = require('./verification-environment.cjs');

const root = path.resolve(__dirname, '..', '..');
const gitVariables = spawnSync('git', ['rev-parse', '--local-env-vars'], {
  cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 16384,
});
if (gitVariables.status !== 0 || typeof gitVariables.stdout !== 'string') {
  console.error('Cannot determine repository-local Git bindings; commit verification was not started.');
  process.exit(1);
}
const opts = {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: createVerificationEnvironment(process.env, gitVariables.stdout.trim().split(/\r?\n/u)),
}; // Keep validation independent from the invoking hook's Git and agent context.
const packageManager = process.env.COPILOT_PACKAGE_MANAGER || 'corepack pnpm@10.12.4';

function run(name, args) {
  const r = spawnSync(name, args, opts);
  if (r.status !== 0) {
    process.exit(r.status);
  }
}

run(packageManager, ['run', 'build']);
run(packageManager, ['test']);
run(packageManager, ['run', 'lint']);
