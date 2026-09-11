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
  const bugbotApiPath = path.join(packageRoot, 'build', 'api', 'index.js');
  const version = execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' }).trim();
  const help = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
  const bugbotApi = require(bugbotApiPath);

  if (packageJson.name !== '@vypdev/copilot') {
    throw new Error(`packaged name is ${packageJson.name}, expected @vypdev/copilot.`);
  }
  if (!fs.existsSync(path.join(packageRoot, 'build', 'api', 'src', 'api.d.ts'))) {
    throw new Error('packaged Bugbot API is missing its TypeScript declarations.');
  }
  if (version !== packageJson.version) {
    throw new Error(`CLI reported ${version}, expected ${packageJson.version}.`);
  }
  if (!help.includes('Usage: copilot')) {
    throw new Error('packaged CLI help does not expose the copilot executable.');
  }
  for (const publicExport of ['BugbotReviewService', 'evaluateBugbotFindings', 'buildBugbotAnalytics']) {
    if (typeof bugbotApi[publicExport] !== 'function') {
      throw new Error(`packaged Bugbot API does not expose ${publicExport}.`);
    }
  }

  const consumerRoot = path.join(temporaryDirectory, 'consumer');
  const packageScope = path.join(consumerRoot, 'node_modules', '@vypdev');
  fs.mkdirSync(packageScope, { recursive: true });
  fs.symlinkSync(packageRoot, path.join(packageScope, 'copilot'), 'dir');
  fs.writeFileSync(path.join(consumerRoot, 'index.ts'), [
    "import { BugbotReviewService, type BugbotReviewConfiguration, type BugbotReviewNavigationPort } from '@vypdev/copilot/bugbot';",
    "const configuration: Partial<BugbotReviewConfiguration> = { effort: 'smart' };",
    'const navigation: BugbotReviewNavigationPort = {',
    "  forPullRequest: () => ({ pullRequestUrl: 'https://github.com/o/r/pull/1', commitUrl: 'https://github.com/o/r/commit/a' }),",
    '};',
    'void configuration;',
    'void navigation;',
    'void BugbotReviewService;',
  ].join('\n'));
  execFileSync(process.execPath, [
    path.join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--target', 'ES2022',
    '--module', 'Node16',
    '--moduleResolution', 'Node16',
    path.join(consumerRoot, 'index.ts'),
  ], { cwd: consumerRoot, encoding: 'utf8' });

  console.log(`npm package smoke test: PASS (@vypdev/copilot@${version}, CLI + typed Bugbot API).`);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
