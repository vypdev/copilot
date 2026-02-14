import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureGitHubDirs, copySetupFiles, ensureEnvWithToken, getSetupToken, hasValidSetupToken, setupEnvFileExists } from '../setup_files';

jest.mock('../logger', () => ({
  logInfo: jest.fn(),
}));

const ENV_TOKEN_KEY = 'PERSONAL_ACCESS_TOKEN';
const ENV_PLACEHOLDER = 'PERSONAL_ACCESS_TOKEN=github_pat_11..';

describe('setup_files', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup_files_test_'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('ensureGitHubDirs', () => {
    it('creates .github, .github/workflows and .github/ISSUE_TEMPLATE when they do not exist', () => {
      ensureGitHubDirs(tmpDir);
      expect(fs.existsSync(path.join(tmpDir, '.github'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.github', 'workflows'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE'))).toBe(true);
    });

    it('does not fail when directories already exist', () => {
      fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE'), { recursive: true });
      expect(() => ensureGitHubDirs(tmpDir)).not.toThrow();
      expect(fs.existsSync(path.join(tmpDir, '.github', 'workflows'))).toBe(true);
    });
  });

  describe('copySetupFiles', () => {
    const setupDir = () => path.join(tmpDir, 'setup');

    it('returns { copied: 0, skipped: 0 } when setup/ does not exist', () => {
      const result = copySetupFiles(tmpDir, setupDir());
      expect(result).toEqual({ copied: 0, skipped: 0 });
    });

    it('copies workflow yml files from setup/workflows to .github/workflows', () => {
      fs.mkdirSync(path.join(tmpDir, 'setup', 'workflows'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
      const workflowContent = 'name: test';
      fs.writeFileSync(path.join(tmpDir, 'setup', 'workflows', 'ci.yml'), workflowContent);
      const result = copySetupFiles(tmpDir, setupDir());
      expect(result.copied).toBe(1);
      expect(fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'utf8')).toBe(workflowContent);
    });

    it('skips workflow file when destination already exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'setup', 'workflows'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'setup', 'workflows', 'ci.yml'), 'from-setup');
      fs.writeFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'existing');
      const result = copySetupFiles(tmpDir, setupDir());
      expect(result.skipped).toBe(1);
      expect(result.copied).toBe(0);
      expect(fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'utf8')).toBe('existing');
    });

    it('copies ISSUE_TEMPLATE files when setup/ISSUE_TEMPLATE exists', () => {
      fs.mkdirSync(path.join(tmpDir, 'setup', 'ISSUE_TEMPLATE'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'setup', 'ISSUE_TEMPLATE', 'bug_report.yml'), 'title: Bug');
      const result = copySetupFiles(tmpDir, setupDir());
      expect(result.copied).toBe(1);
      expect(fs.readFileSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml'), 'utf8')).toBe('title: Bug');
    });

    it('copies pull_request_template.md when it exists in setup/', () => {
      fs.mkdirSync(path.join(tmpDir, 'setup'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'setup', 'pull_request_template.md'), '# PR template');
      const result = copySetupFiles(tmpDir, setupDir());
      expect(result.copied).toBe(1);
      expect(fs.readFileSync(path.join(tmpDir, '.github', 'pull_request_template.md'), 'utf8')).toBe('# PR template');
    });

    it('does not create .env when no token in env and no .env (only suggests via log)', () => {
      const saved = process.env[ENV_TOKEN_KEY];
      delete process.env[ENV_TOKEN_KEY];
      try {
        fs.mkdirSync(path.join(tmpDir, 'setup'), { recursive: true });
        copySetupFiles(tmpDir, setupDir());
        expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(false);
      } finally {
        if (saved !== undefined) process.env[ENV_TOKEN_KEY] = saved;
      }
    });

    it('does not overwrite .env when it already exists', () => {
      const saved = process.env[ENV_TOKEN_KEY];
      delete process.env[ENV_TOKEN_KEY];
      try {
        fs.mkdirSync(path.join(tmpDir, 'setup'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, '.env'), 'PERSONAL_ACCESS_TOKEN=existing_token');
        copySetupFiles(tmpDir, setupDir());
        expect(fs.readFileSync(path.join(tmpDir, '.env'), 'utf8')).toBe('PERSONAL_ACCESS_TOKEN=existing_token');
      } finally {
        if (saved !== undefined) process.env[ENV_TOKEN_KEY] = saved;
      }
    });

    it('skips existing ISSUE_TEMPLATE file and copies non-existing one', () => {
      fs.mkdirSync(path.join(tmpDir, 'setup', 'ISSUE_TEMPLATE'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'setup', 'ISSUE_TEMPLATE', 'existing.yml'), 'existing');
      fs.writeFileSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE', 'existing.yml'), 'already-there');
      fs.writeFileSync(path.join(tmpDir, 'setup', 'ISSUE_TEMPLATE', 'new.yml'), 'new');
      const result = copySetupFiles(tmpDir, setupDir());
      expect(result.copied).toBe(1);
      expect(result.skipped).toBe(1);
      expect(fs.readFileSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE', 'existing.yml'), 'utf8')).toBe('already-there');
      expect(fs.readFileSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE', 'new.yml'), 'utf8')).toBe('new');
    });

    it('skips workflow file that is a directory', () => {
      fs.mkdirSync(path.join(tmpDir, 'setup', 'workflows'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'setup', 'workflows', 'ci.yml'), { recursive: true });
      const result = copySetupFiles(tmpDir, setupDir());
      expect(result.copied).toBe(0);
      expect(fs.statSync(path.join(tmpDir, 'setup', 'workflows', 'ci.yml')).isDirectory()).toBe(true);
    });
  });

  describe('ensureEnvWithToken', () => {
    let savedToken: string | undefined;

    beforeEach(() => {
      savedToken = process.env[ENV_TOKEN_KEY];
    });

    afterEach(() => {
      if (savedToken !== undefined) {
        process.env[ENV_TOKEN_KEY] = savedToken;
      } else {
        delete process.env[ENV_TOKEN_KEY];
      }
    });

    it('does not create .env when PERSONAL_ACCESS_TOKEN is set in environment', () => {
      process.env[ENV_TOKEN_KEY] = 'env_token';
      ensureEnvWithToken(tmpDir);
      expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(false);
    });

    it('does not create .env when no token in env and no .env exists (only suggests via log)', () => {
      delete process.env[ENV_TOKEN_KEY];
      ensureEnvWithToken(tmpDir);
      expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(false);
    });

    it('does not overwrite .env when it exists with PERSONAL_ACCESS_TOKEN set', () => {
      delete process.env[ENV_TOKEN_KEY];
      fs.writeFileSync(path.join(tmpDir, '.env'), 'PERSONAL_ACCESS_TOKEN=my_gh_token');
      ensureEnvWithToken(tmpDir);
      expect(fs.readFileSync(path.join(tmpDir, '.env'), 'utf8')).toBe('PERSONAL_ACCESS_TOKEN=my_gh_token');
    });

    it('does not overwrite .env when it exists but PERSONAL_ACCESS_TOKEN is empty', () => {
      delete process.env[ENV_TOKEN_KEY];
      fs.writeFileSync(path.join(tmpDir, '.env'), 'PERSONAL_ACCESS_TOKEN=\n');
      ensureEnvWithToken(tmpDir);
      expect(fs.readFileSync(path.join(tmpDir, '.env'), 'utf8')).toBe('PERSONAL_ACCESS_TOKEN=\n');
    });
  });

  describe('hasValidSetupToken', () => {
    let savedToken: string | undefined;

    beforeEach(() => {
      savedToken = process.env[ENV_TOKEN_KEY];
    });

    afterEach(() => {
      if (savedToken !== undefined) {
        process.env[ENV_TOKEN_KEY] = savedToken;
      } else {
        delete process.env[ENV_TOKEN_KEY];
      }
    });

    it('returns true when PERSONAL_ACCESS_TOKEN in env has length >= 20 and is not placeholder', () => {
      process.env[ENV_TOKEN_KEY] = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      expect(hasValidSetupToken(tmpDir)).toBe(true);
    });

    it('returns false when PERSONAL_ACCESS_TOKEN in env is the placeholder', () => {
      process.env[ENV_TOKEN_KEY] = 'github_pat_11..';
      expect(hasValidSetupToken(tmpDir)).toBe(false);
    });

    it('returns false when PERSONAL_ACCESS_TOKEN in env is too short', () => {
      process.env[ENV_TOKEN_KEY] = 'short';
      expect(hasValidSetupToken(tmpDir)).toBe(false);
    });

    it('returns true when .env has valid token and env is not set', () => {
      delete process.env[ENV_TOKEN_KEY];
      fs.writeFileSync(path.join(tmpDir, '.env'), 'PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(hasValidSetupToken(tmpDir)).toBe(true);
    });

    it('returns false when .env has only placeholder and env is not set', () => {
      delete process.env[ENV_TOKEN_KEY];
      fs.writeFileSync(path.join(tmpDir, '.env'), 'PERSONAL_ACCESS_TOKEN=github_pat_11..');
      expect(hasValidSetupToken(tmpDir)).toBe(false);
    });

    it('falls back to .env when env is set but invalid (placeholder); then returns true', () => {
      process.env[ENV_TOKEN_KEY] = 'github_pat_11..';
      fs.writeFileSync(path.join(tmpDir, '.env'), 'PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(hasValidSetupToken(tmpDir)).toBe(true);
    });
  });

  describe('getSetupToken', () => {
    it('returns token from env when valid', () => {
      process.env[ENV_TOKEN_KEY] = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
      expect(getSetupToken(tmpDir)).toBe('ghp_abcdefghijklmnopqrstuvwxyz123456');
      delete process.env[ENV_TOKEN_KEY];
    });

    it('returns token from .env when env is not set', () => {
      delete process.env[ENV_TOKEN_KEY];
      fs.writeFileSync(path.join(tmpDir, '.env'), 'PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(getSetupToken(tmpDir)).toBe('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    });

    it('returns undefined when no valid token', () => {
      delete process.env[ENV_TOKEN_KEY];
      fs.writeFileSync(path.join(tmpDir, '.env'), 'PERSONAL_ACCESS_TOKEN=github_pat_11..');
      expect(getSetupToken(tmpDir)).toBeUndefined();
    });
  });

  describe('setupEnvFileExists', () => {
    it('returns true when .env file exists', () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'PERSONAL_ACCESS_TOKEN=token');
      expect(setupEnvFileExists(tmpDir)).toBe(true);
    });

    it('returns false when .env does not exist', () => {
      expect(setupEnvFileExists(tmpDir)).toBe(false);
    });

    it('returns false when .env is a directory', () => {
      fs.mkdirSync(path.join(tmpDir, '.env'), { recursive: true });
      expect(setupEnvFileExists(tmpDir)).toBe(false);
    });
  });
});
