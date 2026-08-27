import * as fs from 'fs';
import * as path from 'path';
import { copySetupDirectory, copySetupFile } from './setup_file_copy';
import { logInfo } from './logger';

/**
 * Ensure .github, .github/workflows and .github/ISSUE_TEMPLATE exist; create them if missing.
 * @param cwd - Directory (repo root)
 */
export function ensureGitHubDirs(cwd: string): void {
  const githubDir = path.join(cwd, '.github');
  const workflowsDir = path.join(cwd, '.github', 'workflows');
  const issueTemplateDir = path.join(cwd, '.github', 'ISSUE_TEMPLATE');
  if (!fs.existsSync(githubDir)) {
    logInfo('📁 Creating .github/...');
    fs.mkdirSync(githubDir, { recursive: true });
  }
  if (!fs.existsSync(workflowsDir)) {
    logInfo('📁 Creating .github/workflows/...');
    fs.mkdirSync(workflowsDir, { recursive: true });
  }
  if (!fs.existsSync(issueTemplateDir)) {
    logInfo('📁 Creating .github/ISSUE_TEMPLATE/...');
    fs.mkdirSync(issueTemplateDir, { recursive: true });
  }
}

/**
 * Copy setup files from setup/ to repo (.github/ workflows, ISSUE_TEMPLATE, and pull_request_template.md).
 * Skips files that already exist at destination (no overwrite).
 * Logs each file copied or skipped. No-op if setup/ does not exist.
 * By default setup dir is the copilot package root (not cwd), so it works when running from another repo.
 * @param cwd - Repo root (destination)
 * @param setupDirOverride - Optional path to setup/ folder (for tests). If not set, uses package root.
 * @returns { copied, skipped }
 */
export function copySetupFiles(cwd: string, setupDirOverride?: string): { copied: number; skipped: number } {
  const setupDir = setupDirOverride ?? path.join(__dirname, '..', '..', 'setup');
  if (!fs.existsSync(setupDir)) return { copied: 0, skipped: 0 };

  const workflows = copySetupDirectory(
    path.join(setupDir, 'workflows'),
    path.join(cwd, '.github', 'workflows'),
    (fileName) => fileName.endsWith('.yml') || fileName.endsWith('.yaml'),
    'setup/workflows',
  );
  const issueTemplates = copySetupDirectory(
    path.join(setupDir, 'ISSUE_TEMPLATE'),
    path.join(cwd, '.github', 'ISSUE_TEMPLATE'),
    () => true,
    'setup/ISSUE_TEMPLATE',
  );
  const pullRequestTemplate = copySetupFile(
    path.join(setupDir, 'pull_request_template.md'),
    path.join(cwd, '.github', 'pull_request_template.md'),
    'setup/pull_request_template.md',
    '.github/pull_request_template.md',
  );
  // Credentials are deliberately never copied from the package. Keep the
  // destination check here so setup can guide users to their local .env.
  ensureEnvWithToken(cwd);
  return [workflows, issueTemplates, pullRequestTemplate].reduce((total, current) => ({
    copied: total.copied + current.copied,
    skipped: total.skipped + current.skipped,
  }), { copied: 0, skipped: 0 });
}

const ENV_TOKEN_KEY = 'PERSONAL_ACCESS_TOKEN';
const ENV_PLACEHOLDER_VALUE = 'github_pat_11..';
/** Minimum length for a token to be considered "defined" (not placeholder). */
const MIN_VALID_TOKEN_LENGTH = 20;

function getTokenFromEnvFile(envPath: string): string | null {
  if (!fs.existsSync(envPath) || !fs.statSync(envPath).isFile()) return null;
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(new RegExp(`^${ENV_TOKEN_KEY}=(.+)$`, 'm'));
  if (!match) return null;
  const value = match[1].trim().replace(/^["']|["']$/g, '');
  return value.length > 0 ? value : null;
}

/**
 * Logs the current state of PERSONAL_ACCESS_TOKEN (environment or .env). Does not create .env.
 */
export function ensureEnvWithToken(cwd: string): void {
  const envPath = path.join(cwd, '.env');
  const tokenInEnv = process.env[ENV_TOKEN_KEY]?.trim();
  if (tokenInEnv) {
    logInfo('  🔑 PERSONAL_ACCESS_TOKEN is set in environment; .env not needed.');
    return;
  }
  if (fs.existsSync(envPath)) {
    const tokenInFile = getTokenFromEnvFile(envPath);
    if (tokenInFile) {
      logInfo('  ✅ .env exists and contains PERSONAL_ACCESS_TOKEN.');
    } else {
      logInfo('  ⚠️  .env exists but PERSONAL_ACCESS_TOKEN is missing or empty.');
    }
    return;
  }
  logInfo('  💡 You can create a .env file here with PERSONAL_ACCESS_TOKEN=your_token or set it in your environment.');
}

function isTokenValueValid(token: string): boolean {
  const t = token.trim();
  return t.length >= MIN_VALID_TOKEN_LENGTH && t !== ENV_PLACEHOLDER_VALUE;
}

/**
 * Resolves the PERSONAL_ACCESS_TOKEN for setup from a single priority order:
 * 1. override (e.g. CLI --token) if provided and valid,
 * 2. process.env.PERSONAL_ACCESS_TOKEN,
 * 3. .env file in cwd.
 * Returns undefined if no valid token is found.
 */
export function getSetupToken(cwd: string, override?: string): string | undefined {
  const overrideTrimmed = override?.trim();
  if (overrideTrimmed && isTokenValueValid(overrideTrimmed)) return overrideTrimmed;
  const fromEnv = process.env[ENV_TOKEN_KEY]?.trim();
  if (fromEnv && isTokenValueValid(fromEnv)) return fromEnv;
  const envPath = path.join(cwd, '.env');
  const fromFile = getTokenFromEnvFile(envPath);
  if (fromFile !== null && isTokenValueValid(fromFile)) return fromFile;
  return undefined;
}

/**
 * Returns true if a valid setup token is available (same resolution order as getSetupToken).
 * Pass an optional override (e.g. CLI --token) so validation considers all sources consistently.
 */
export function hasValidSetupToken(cwd: string, override?: string): boolean {
  return getSetupToken(cwd, override) !== undefined;
}

/** Returns true if a .env file exists in the given directory. */
export function setupEnvFileExists(cwd: string): boolean {
  const envPath = path.join(cwd, '.env');
  return fs.existsSync(envPath) && fs.statSync(envPath).isFile();
}
