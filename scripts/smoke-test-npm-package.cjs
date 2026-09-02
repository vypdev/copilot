#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-npm-smoke-'));

try {
  const output = execFileSync(
    'npm',
    [
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      temporaryDirectory,
      '--cache',
      path.join(temporaryDirectory, 'npm-cache'),
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  const metadata = JSON.parse(output);
  const packageFile = metadata[0]?.filename;
  if (typeof packageFile !== 'string') {
    throw new Error('npm pack did not return a package filename.');
  }

  const extractedDirectory = path.join(temporaryDirectory, 'package');
  fs.mkdirSync(extractedDirectory);
  execFileSync('tar', ['-xzf', path.join(temporaryDirectory, packageFile), '-C', extractedDirectory]);

  const packageRoot = path.join(extractedDirectory, 'package');
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const cliPath = path.join(packageRoot, 'build', 'cli', 'index.js');
  const version = execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' }).trim();
  const help = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });

  if (packageJson.name !== '@vypdev/copilot') {
    throw new Error(`packaged name is ${packageJson.name}, expected @vypdev/copilot.`);
  }
  if (version !== packageJson.version) {
    throw new Error(`CLI reported ${version}, expected ${packageJson.version}.`);
  }
  if (!help.includes('Usage: copilot')) {
    throw new Error('packaged CLI help does not expose the copilot executable.');
  }

  console.log(`npm package smoke test: PASS (@vypdev/copilot@${version}).`);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
