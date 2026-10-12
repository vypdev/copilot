/**
 * Installs repository hooks into normal and linked-worktree Git metadata.
 * Cross-platform: Windows, macOS, Linux.
 * Run automatically on pnpm install, or: node scripts/install-git-hooks.cjs
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const hooksSrc = path.join(root, 'scripts', 'git-hooks');
const metadata = path.join(root, '.git');
if (!fs.existsSync(metadata)) process.exit(0);
if (!fs.existsSync(hooksSrc) || !fs.statSync(hooksSrc).isDirectory()) {
  process.exit(0);
}
let metadataDirectories;
if (fs.statSync(metadata).isDirectory()) {
  const hooks = path.join(metadata, 'hooks');
  if (!fs.existsSync(hooks) || !fs.statSync(hooks).isDirectory()) process.exit(0);
  metadataDirectories = [metadata];
} else {
  const readMetadata = flag => {
    const result = spawnSync('git', ['rev-parse', flag], {
      cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 16384,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const value = result.status === 0 && typeof result.stdout === 'string' ? result.stdout.trim() : '';
    if (!value || /[\r\n\0]/u.test(value)) return undefined;
    const directory = path.resolve(root, value);
    return fs.existsSync(directory) && fs.statSync(directory).isDirectory() ? directory : undefined;
  };
  const local = readMetadata('--git-dir');
  const common = readMetadata('--git-common-dir');
  if (!local || !common) {
    console.warn('Git metadata could not be resolved; repository hooks were not installed.');
    process.exit(0);
  }
  // Git's default uses shared hooks; hook-chain wrappers can use the worktree's own metadata.
  metadataDirectories = [...new Set([local, common])];
}

const files = fs.readdirSync(hooksSrc);
for (const name of files) {
  const src = path.join(hooksSrc, name);
  if (!fs.statSync(src).isFile()) continue;
  for (const directory of metadataDirectories) {
    const hooksDst = path.join(directory, 'hooks');
    fs.mkdirSync(hooksDst, { recursive: true });
    const dst = path.join(hooksDst, name);
    fs.copyFileSync(src, dst);
    try {
      fs.chmodSync(dst, 0o755);
    } catch (_) {
      // Windows: chmod may not support execute; Git for Windows still runs the hook.
    }
  }
  console.log('Installed hook: ' + name);
}
