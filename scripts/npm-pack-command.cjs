const { execFileSync } = require('node:child_process');
const path = require('node:path');

function runNpmPack(args, options) {
  if (process.platform === 'win32') {
    // npm.cmd cannot be executed by execFile without a shell on Windows.
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return execFileSync(process.execPath, [npmCli, 'pack', ...args], options);
  }
  return execFileSync('npm', ['pack', ...args], options);
}

module.exports = { runNpmPack };
