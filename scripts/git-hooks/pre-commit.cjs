/**
 * Pre-commit hook: run build, test, and lint before allowing a commit.
 * Cross-platform (Windows, macOS, Linux). Invoked by the pre-commit shell launcher.
 * On Windows, Git for Windows runs the launcher with Bash, which then runs this script with Node.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const opts = {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: Object.fromEntries(
    Object.entries(process.env).filter(([key]) => ![
      'AGENT_PROVIDER',
      'AGENT_MODEL',
      'AGENT_COMMAND',
      'AGENT_MODEL_PROVIDER',
      'AGENT_ALLOWED_MODEL_PROVIDERS',
      'AGENT_ALLOWED_MODELS',
    ].includes(key)),
  ),
}; // Keep hooks deterministic and independent from local agent configuration
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
