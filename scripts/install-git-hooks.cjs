/**
 * Installs git hooks from scripts/git-hooks/ into .git/hooks/.
 * Cross-platform: Windows, macOS, Linux.
 * Run automatically on pnpm install, or: node scripts/install-git-hooks.cjs
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const hooksSrc = path.join(root, 'scripts', 'git-hooks');
const hooksDst = path.join(root, '.git', 'hooks');

if (!fs.existsSync(path.join(root, '.git')) || !fs.statSync(path.join(root, '.git')).isDirectory()) {
  process.exit(0);
}
if (!fs.existsSync(hooksSrc) || !fs.statSync(hooksSrc).isDirectory()) {
  process.exit(0);
}
if (!fs.existsSync(hooksDst) || !fs.statSync(hooksDst).isDirectory()) {
  process.exit(0);
}

const files = fs.readdirSync(hooksSrc);
for (const name of files) {
  const src = path.join(hooksSrc, name);
  if (!fs.statSync(src).isFile()) continue;
  const dst = path.join(hooksDst, name);
  fs.copyFileSync(src, dst);
  try {
    fs.chmodSync(dst, 0o755);
  } catch (_) {
    // Windows: chmod may not support execute; Git for Windows still runs the hook
  }
  console.log('Installed hook: ' + name);
}
