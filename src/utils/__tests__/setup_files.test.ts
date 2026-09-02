import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureGitHubDirs, copySetupFiles, getSetupToken, hasValidSetupToken, compareSetupWorkflows } from '../setup_files';

jest.mock('../logger', () => ({ logInfo: jest.fn() }));

describe('setup_files', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup_files_test_')); });
  afterEach(() => { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('creates the GitHub directories used by setup', () => {
    ensureGitHubDirs(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, '.github', 'workflows'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE'))).toBe(true);
  });

  it('copies setup files and never creates a local credential file', () => {
    const setupDir = path.join(tmpDir, 'setup');
    fs.mkdirSync(path.join(setupDir, 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(setupDir, 'workflows', 'ci.yml'), 'name: test');
    expect(copySetupFiles(tmpDir, setupDir)).toEqual({ copied: 1, skipped: 0 });
    expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(false);
  });

  it('keeps existing workflows by default and reports their state', () => {
    const setupDir = path.join(tmpDir, 'setup');
    fs.mkdirSync(path.join(setupDir, 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(setupDir, 'workflows', 'ci.yml'), 'new');
    fs.writeFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'old');
    expect(copySetupFiles(tmpDir, setupDir)).toEqual({ copied: 0, skipped: 1 });
    expect(compareSetupWorkflows(tmpDir, undefined, setupDir)).toEqual([
      { file: 'ci.yml', destination: '.github/workflows/ci.yml', status: 'changed' },
    ]);
  });

  it('updates only approved workflows and preserves a backup', () => {
    const setupDir = path.join(tmpDir, 'setup');
    fs.mkdirSync(path.join(setupDir, 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(setupDir, 'workflows', 'ci.yml'), 'new');
    fs.writeFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'old');
    const result = copySetupFiles(tmpDir, setupDir, undefined, {
      updateExistingWorkflows: true,
      approvedWorkflowFiles: ['ci.yml'],
    });
    expect(result).toEqual({ copied: 1, skipped: 0 });
    expect(fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'utf8')).toBe('new');
    const backups = fs.readdirSync(path.join(tmpDir, '.copilot', 'setup-backups'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(tmpDir, '.copilot', 'setup-backups', backups[0], 'ci.yml'), 'utf8')).toBe('old');
  });

  describe('setup token resolution', () => {
    const key = 'PERSONAL_ACCESS_TOKEN';
    let previous: string | undefined;
    beforeEach(() => { previous = process.env[key]; });
    afterEach(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });

    it('uses an explicit token before the environment', () => {
      process.env[key] = 'ghp_environment_token_xxxxxxxxxxxx';
      expect(getSetupToken(tmpDir, 'ghp_explicit_token_xxxxxxxxxxxx')).toBe('ghp_explicit_token_xxxxxxxxxxxx');
    });

    it('uses only the environment and never reads .env', () => {
      delete process.env[key];
      fs.writeFileSync(path.join(tmpDir, '.env'), `${key}=ghp_file_token_xxxxxxxxxxxxxxxxxxxx`);
      expect(getSetupToken(tmpDir)).toBeUndefined();
      expect(hasValidSetupToken(tmpDir)).toBe(false);
    });

    it('rejects placeholders and accepts a sufficiently long token', () => {
      process.env[key] = 'github_pat_11..';
      expect(hasValidSetupToken(tmpDir)).toBe(false);
      process.env[key] = 'ghp_valid_token_xxxxxxxxxxxxxxxxxxxx';
      expect(hasValidSetupToken(tmpDir)).toBe(true);
    });
  });
});
