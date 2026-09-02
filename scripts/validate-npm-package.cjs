#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const packagePath = path.join(repositoryRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const errors = [];

function error(message) {
  errors.push(message);
}

if (packageJson.name !== '@vypdev/copilot') {
  error('package name must be @vypdev/copilot.');
}

if (packageJson.publishConfig?.access !== 'public') {
  error('publishConfig.access must be public.');
}

if (packageJson.bin?.copilot !== './build/cli/index.js') {
  error('the copilot bin must point to ./build/cli/index.js.');
}

const requiredPackageFiles = [
  'action.yml',
  'build/cli/index.js',
  'build/github_action/index.js',
  'setup/ISSUE_TEMPLATE/',
  'setup/workflows/',
  'setup/pull_request_template.md',
  'scripts/install-git-hooks.cjs',
];
const declaredFiles = Array.isArray(packageJson.files) ? packageJson.files : [];
for (const requiredFile of requiredPackageFiles) {
  if (!declaredFiles.includes(requiredFile)) {
    error(`files must include ${requiredFile}.`);
  }
}

const requiredRepositoryFiles = [
  'action.yml',
  'build/cli/index.js',
  'build/github_action/index.js',
  'setup/workflows/copilot_issue.yml',
  'setup/ISSUE_TEMPLATE/config.yml',
  'setup/pull_request_template.md',
  'scripts/install-git-hooks.cjs',
];
for (const relativeFile of requiredRepositoryFiles) {
  const absoluteFile = path.join(repositoryRoot, relativeFile);
  if (!fs.existsSync(absoluteFile)) {
    error(`required repository file is missing: ${relativeFile}.`);
  }
}

const cliPath = path.join(repositoryRoot, packageJson.bin?.copilot ?? '');
if (fs.existsSync(cliPath)) {
  try {
    fs.accessSync(cliPath, fs.constants.X_OK);
  } catch (_) {
    error('build/cli/index.js must be executable.');
  }
}

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-npm-pack-'));
try {
  const output = execFileSync(
    'npm',
    [
      'pack',
      '--dry-run',
      '--json',
      '--ignore-scripts',
      '--cache',
      path.join(temporaryDirectory, 'npm-cache'),
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  const metadata = JSON.parse(output);
  const packageFiles = new Set((metadata[0]?.files ?? []).map((file) => file.path));

  for (const requiredFile of ['action.yml', 'build/cli/index.js', 'build/github_action/index.js', 'setup/workflows/copilot_issue.yml', 'scripts/install-git-hooks.cjs']) {
    if (!packageFiles.has(requiredFile)) {
      error(`npm package is missing ${requiredFile}.`);
    }
  }

  const forbiddenFile = [...packageFiles].find((file) => {
    const normalized = file.toLowerCase();
    return normalized === '.env'
      || normalized.endsWith('/.env')
      || normalized.includes('node_modules/')
      || normalized.startsWith('.git/');
  });
  if (forbiddenFile) {
    error(`npm package contains a forbidden file: ${forbiddenFile}.`);
  }

  if (errors.length === 0) {
    console.log(`npm package validation: PASS (${packageFiles.size} files).`);
  }
} catch (packError) {
  error(`npm pack --dry-run failed: ${packError instanceof Error ? packError.message : String(packError)}.`);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
