import * as fs from 'fs';
import * as path from 'path';
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
 * Copy setup files from setup/ to repo (.github/ workflows, ISSUE_TEMPLATE, pull_request_template.md, .env at root).
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

  let copied = 0;
  let skipped = 0;
  const workflowsSrc = path.join(setupDir, 'workflows');
  const workflowsDst = path.join(cwd, '.github', 'workflows');
  if (fs.existsSync(workflowsSrc)) {
    const files = fs.readdirSync(workflowsSrc).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    for (const f of files) {
      const src = path.join(workflowsSrc, f);
      const dst = path.join(workflowsDst, f);
      if (fs.statSync(src).isFile()) {
        if (fs.existsSync(dst)) {
          logInfo(`  ⏭️  .github/workflows/${f} already exists; skipping.`);
          skipped += 1;
        } else {
          fs.copyFileSync(src, dst);
          logInfo(`  ✅ Copied setup/workflows/${f} → .github/workflows/${f}`);
          copied += 1;
        }
      }
    }
  }
  const issueTemplateSrc = path.join(setupDir, 'ISSUE_TEMPLATE');
  const issueTemplateDst = path.join(cwd, '.github', 'ISSUE_TEMPLATE');
  if (fs.existsSync(issueTemplateSrc)) {
    const files = fs.readdirSync(issueTemplateSrc).filter((f) => fs.statSync(path.join(issueTemplateSrc, f)).isFile());
    for (const f of files) {
      const src = path.join(issueTemplateSrc, f);
      const dst = path.join(issueTemplateDst, f);
      if (fs.existsSync(dst)) {
        logInfo(`  ⏭️  .github/ISSUE_TEMPLATE/${f} already exists; skipping.`);
        skipped += 1;
      } else {
        fs.copyFileSync(src, dst);
        logInfo(`  ✅ Copied setup/ISSUE_TEMPLATE/${f} → .github/ISSUE_TEMPLATE/${f}`);
        copied += 1;
      }
    }
  }
  const prTemplateSrc = path.join(setupDir, 'pull_request_template.md');
  const prTemplateDst = path.join(cwd, '.github', 'pull_request_template.md');
  if (fs.existsSync(prTemplateSrc)) {
    if (fs.existsSync(prTemplateDst)) {
      logInfo('  ⏭️  .github/pull_request_template.md already exists; skipping.');
      skipped += 1;
    } else {
      fs.copyFileSync(prTemplateSrc, prTemplateDst);
      logInfo('  ✅ Copied setup/pull_request_template.md → .github/pull_request_template.md');
      copied += 1;
    }
  }
  ensureEnvWithToken(cwd);
  return { copied, skipped };
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
  return (
    t.length >= MIN_VALID_TOKEN_LENGTH &&
    t !== ENV_PLACEHOLDER_VALUE &&
    !t.startsWith('github_pat_11..')
  );
}

/**
 * Returns the PERSONAL_ACCESS_TOKEN to use for setup (from environment or .env in cwd).
 * Same resolution order as hasValidSetupToken; returns undefined if no valid token is found.
 */
export function getSetupToken(cwd: string): string | undefined {
  const fromEnv = process.env[ENV_TOKEN_KEY]?.trim();
  if (fromEnv && isTokenValueValid(fromEnv)) return fromEnv;
  const envPath = path.join(cwd, '.env');
  const fromFile = getTokenFromEnvFile(envPath);
  if (fromFile !== null && isTokenValueValid(fromFile)) return fromFile;
  return undefined;
}

/**
 * Returns true if PERSONAL_ACCESS_TOKEN is available and looks like a real token
 * (from environment or .env), not the placeholder. Setup should only continue when this is true.
 */
export function hasValidSetupToken(cwd: string): boolean {
  return getSetupToken(cwd) !== undefined;
}

/** Returns true if a .env file exists in the given directory. */
export function setupEnvFileExists(cwd: string): boolean {
  const envPath = path.join(cwd, '.env');
  return fs.existsSync(envPath) && fs.statSync(envPath).isFile();
}
