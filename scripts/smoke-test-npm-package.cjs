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
  const webIndexPath = path.join(packageRoot, 'build', 'web', 'index.html');
  const bugbotApiPath = path.join(packageRoot, 'build', 'api', 'index.js');
  const version = execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' }).trim();
  const help = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
  const bugbotApi = require(bugbotApiPath);
  const cliBundle = fs.readFileSync(cliPath, 'utf8');
  for (const runtime of ['github_action', 'api']) {
    const bundle = fs.readFileSync(path.join(packageRoot, 'build', runtime, 'index.js'), 'utf8');
    if (bundle.includes('Local setup web assets are incomplete') || bundle.includes('Control moved to another tab.')) {
      throw new Error(`Packaged ${runtime} runtime must not include the local web setup server.`);
    }
  }

  if (packageJson.name !== '@vypdev/copilot') {
    throw new Error(`packaged name is ${packageJson.name}, expected @vypdev/copilot.`);
  }
  if (!fs.existsSync(path.join(packageRoot, 'build', 'api', 'src', 'api.d.ts'))) {
    throw new Error('packaged Bugbot API is missing its TypeScript declarations.');
  }
  if (!fs.existsSync(webIndexPath) || !fs.readFileSync(webIndexPath, 'utf8').includes('/assets/')) {
    throw new Error('Packaged local web setup assets are missing or incomplete.');
  }
  const webAssets = [...fs.readFileSync(webIndexPath, 'utf8').matchAll(/(?:\.\/)?(assets\/[A-Za-z0-9._-]+\.(?:js|css))/g)]
    .map(match => match[1]);
  if (webAssets.length < 2 || webAssets.some(asset => !fs.statSync(path.join(packageRoot, 'build', 'web', asset)).isFile())) {
    throw new Error('Packaged local web setup asset paths do not resolve from the extracted tarball.');
  }
  if (version !== packageJson.version) {
    throw new Error(`CLI reported ${version}, expected ${packageJson.version}.`);
  }
  if (!help.includes('Usage: copilot')) {
    throw new Error('packaged CLI help does not expose the copilot executable.');
  }
  const setupHelp = execFileSync(process.execPath, [cliPath, 'setup', '--help'], { encoding: 'utf8' });
  for (const option of ['--issue-workflows <types>', '--agent-guidance <mode>', '--non-interactive', '--web']) {
    if (!setupHelp.includes(option)) throw new Error(`packaged setup CLI is missing ${option}.`);
  }
  for (const publicExport of ['BugbotReviewService', 'evaluateBugbotFindings', 'buildBugbotAnalytics']) {
    if (typeof bugbotApi[publicExport] !== 'function') {
      throw new Error(`packaged Bugbot API does not expose ${publicExport}.`);
    }
  }
  for (const generatedContract of [
    '.copilot/repository-profile.json',
    '.copilot/AGENT_GUIDE.md',
    '.agents/skills/copilot-repository-workflow/SKILL.md',
    'copilot:agent-guidance:start',
  ]) {
    if (!cliBundle.includes(generatedContract)) {
      throw new Error(`packaged setup CLI is missing the generated guidance contract ${generatedContract}.`);
    }
  }

  const consumerRoot = path.join(temporaryDirectory, 'consumer');
  const packageScope = path.join(consumerRoot, 'node_modules', '@vypdev');
  fs.mkdirSync(packageScope, { recursive: true });
  fs.symlinkSync(packageRoot, path.join(packageScope, 'copilot'), 'dir');
  fs.writeFileSync(path.join(consumerRoot, 'index.ts'), [
    "import { BugbotReviewService, type BugbotReviewConfiguration, type BugbotScmGateway } from '@vypdev/copilot/bugbot';",
    "const configuration: Partial<BugbotReviewConfiguration> = { effort: 'smart' };",
    'const gateway = null as unknown as BugbotScmGateway;',
    'void configuration;',
    'void gateway;',
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
