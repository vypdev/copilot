#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runNpmPack } = require('./npm-pack-command.cjs');
const { smokePackagedWebSession } = require('./smoke-packaged-web-session.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-npm-smoke-'));

async function main() {
try {
  const output = runNpmPack(
    [
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
  if (typeof packageFile !== 'string' || path.basename(packageFile) !== packageFile) {
    throw new Error('npm pack did not return a package filename.');
  }

  const extractedDirectory = path.join(temporaryDirectory, 'package');
  fs.mkdirSync(extractedDirectory);
  const archivePath = path.join(temporaryDirectory, packageFile);
  execFileSync('tar', ['-C', extractedDirectory, '-xzf', '-'], {
    input: fs.readFileSync(archivePath),
  });

  const packageRoot = path.join(extractedDirectory, 'package');
  const admissionManifest = fs.readFileSync(path.join(packageRoot, 'issue-admission/action.yml'), 'utf8');
  if (!admissionManifest.includes('using: node24') || !admissionManifest.includes('main: index.cjs')
    || !admissionManifest.includes('issue-event-admission-mode:')) {
    throw new Error('Packaged issue admission subaction must resolve the shipped Node runtime.');
  }
  const admissionBootstrap = fs.readFileSync(path.join(packageRoot, 'issue-admission/index.cjs'), 'utf8');
  if (!admissionBootstrap.includes("require('../build/github_action/index.js')") || !admissionBootstrap.includes('COPILOT_ISSUE_ADMISSION_BOOTSTRAP')) {
    throw new Error('Packaged issue admission must use its fail-closed bootstrap.');
  }
  const recoveryManifest = fs.readFileSync(path.join(packageRoot, 'deployment-recovery/action.yml'), 'utf8');
  const recoveryBootstrap = fs.readFileSync(path.join(packageRoot, 'deployment-recovery/index.cjs'), 'utf8');
  if (!recoveryManifest.includes('using: node24') || !recoveryManifest.includes('main: index.cjs')
    || !recoveryBootstrap.includes("require('../build/deployment_recovery/index.js').runDeploymentCandidatePreflightAction()")
    || typeof require(path.join(packageRoot, 'build/deployment_recovery/index.js')).runDeploymentCandidatePreflightAction !== 'function') {
    throw new Error('Packaged candidate recovery must resolve its standalone read-only Node entrypoint.');
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const cliPath = path.join(packageRoot, 'build', 'cli', 'index.js');
  const webIndexPath = path.join(packageRoot, 'build', 'web', 'index.html');
  const bugbotApiPath = path.join(packageRoot, 'build', 'api', 'index.js');
  const version = execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' }).trim();
  const help = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
  const bugbotApi = require(bugbotApiPath);
  const cliBundle = fs.readFileSync(cliPath, 'utf8');
  const verificationStarter = fs.readFileSync(path.join(packageRoot, 'setup/actions/copilot-verification-setup/action.yml'), 'utf8');
  if (!verificationStarter.includes('using: composite') || !verificationStarter.includes('exit 1')
    || !verificationStarter.includes('MAIN_BRANCH') || !cliBundle.includes('setup/actions/copilot-verification-setup/action.yml')) {
    throw new Error('Packaged setup must resolve the fail-closed consumer verification starter.');
  }
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
  fs.symlinkSync(packageRoot, path.join(packageScope, 'copilot'), process.platform === 'win32' ? 'junction' : 'dir');
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

  await smokePackagedWebSession(cliPath, temporaryDirectory);
  console.log(`npm package smoke test: PASS (@vypdev/copilot@${version}, CLI + typed Bugbot API + isolated local web session).`);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
