const { spawnSync } = require('node:child_process');
const { statSync } = require('node:fs');
const { dirname, join } = require('node:path');

const node = process.execPath;
const npmCli = join(dirname(node), 'node_modules', 'npm', 'bin', 'npm-cli.js');
try {
  if (!statSync(npmCli).isFile()) throw new Error('not a file');
} catch {
  throw new Error('The job Node installation has no npm CLI script.');
}

const result = spawnSync(node, [npmCli, '--version'], {
  encoding: 'utf8',
  timeout: 15_000,
  windowsHide: true,
});
if (result.error || result.status !== 0 || !/^\d+\.\d+\.\d+/.test(result.stdout.trim())) {
  throw new Error('The job Node installation cannot run its npm CLI script.');
}
console.log('Job Node and its npm CLI script are available.');
