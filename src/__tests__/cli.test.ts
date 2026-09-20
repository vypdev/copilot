/**
 * Unit tests for CLI commands.
 * Mocks execSync (getGitInfo), runLocalAction, IssueMetadataRepository, and the fixer port.
 */

import { execSync } from 'child_process';
import { program } from '../cli';
import { runLocalAction } from '../actions/local_action';
import { ACTIONS } from '../data/model/action_types';
import { INPUT_KEYS } from '../application/contracts/input_keys';
import type { SetupTokenPermissionReport, SetupTokenPermissionRequirement } from '../domain/setup_token_permissions';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

jest.mock('../actions/local_action', () => ({
  runLocalAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

const mockIsIssue = jest.fn();
jest.mock('../data/repository/issue/issue_metadata_repository', () => ({
  IssueMetadataRepository: jest.fn().mockImplementation(() => ({
    isIssue: mockIsIssue,
  })),
}));

const mockFix = jest.fn();
jest.mock('../infrastructure/composition/agent_capability_composition_root', () => ({
  createFixerQueryPort: () => ({ fix: mockFix }),
  createLanguageQueryPort: () => ({ query: jest.fn() }),
}));

const mockGetSetupToken = jest.fn();
const mockSetupEnvFileExists = jest.fn();
jest.mock('../utils/setup_files', () => {
  const actual = jest.requireActual<typeof import('../utils/setup_files')>('../utils/setup_files');
  return {
    ...actual,
    getSetupToken: (...args: unknown[]) => mockGetSetupToken(...args),
    setupEnvFileExists: (...args: unknown[]) => mockSetupEnvFileExists(...args),
  };
});

const mockDoctorExecute = jest.fn();
const mockDoctorPresent = jest.fn();
const mockDoctorPresenter = jest.fn();
jest.mock('../infrastructure/composition/setup_doctor_composition_root', () => ({
  createSetupDoctorUseCase: () => ({ execute: mockDoctorExecute }),
  createSetupMergeQueueReadinessUseCase: () => ({ inspect: jest.fn().mockResolvedValue([]) }),
}));
jest.mock('../cli/setup_doctor_presenter', () => ({
  SetupDoctorPresenter: jest.fn().mockImplementation((...args: unknown[]) => {
    mockDoctorPresenter(...args);
    return { present: mockDoctorPresent };
  }),
}));

const mockTokenPermissionInspect = jest.fn(async (request: { role: 'setup' | 'workflow'; requirements: readonly SetupTokenPermissionRequirement[] }): Promise<SetupTokenPermissionReport> => ({
  role: request.role,
  identityStatus: 'valid' as const,
  identityMessage: 'verified',
  ready: true,
  checks: request.requirements.map(requirement => ({ ...requirement, status: 'verified', message: 'available' })),
}));
jest.mock('../infrastructure/composition/setup_token_permissions_composition_root', () => ({
  createSetupTokenPermissionsUseCase: () => ({ inspect: mockTokenPermissionInspect }),
}));

jest.mock('../infrastructure/composition/setup_credentials_composition_root', () => ({
  createSetupCredentialsUseCase: () => ({ collect: jest.fn().mockResolvedValue({ collection: { apiKeys: [] }, checks: [], existingSecretNames: [] }) }),
  createSetupRemoteConfigurationReadPort: () => ({
    inspect: jest.fn().mockResolvedValue({
      ownerType: 'User',
      repositoryVisibility: 'private',
      repositorySecrets: [],
      organizationSecrets: [],
      repositoryVariables: [],
      organizationVariables: [],
      organizationAccess: 'not_applicable',
      organizationSecretsAccess: 'not_applicable',
      organizationVariablesAccess: 'not_applicable',
    }),
  }),
}));

describe('CLI', () => {
  let exitSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
    process.env.AGENT_PROVIDER = 'opencode';
    process.env.AGENT_MODEL = 'test-model';
    process.env.AGENT_EXECUTABLE = 'opencode';
    process.env.AGENT_MODEL_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    (execSync as jest.Mock).mockImplementation((command: string) => Buffer.from(
      command === 'git rev-parse HEAD'
        ? 'a'.repeat(40)
        : 'https://github.com/test-owner/test-repo.git',
    ));
    (runLocalAction as jest.Mock).mockResolvedValue(undefined);
    mockIsIssue.mockResolvedValue(true);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    // Default: return override token when present (so setup --token ... still works)
    mockGetSetupToken.mockImplementation((_cwd: string, override?: string) =>
      override?.trim() && override.trim().length >= 20 ? override.trim() : undefined
    );
    mockSetupEnvFileExists.mockReturnValue(false);
    mockDoctorExecute.mockResolvedValue({
      catalog: { locale: 'en-US', message: jest.fn() },
      report: { healthy: true, checks: [], totals: { pass: 0, warn: 0, fail: 0, skipped: 0 } },
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    consoleLogSpy?.mockRestore();
  });

  it('never exposes an environment token in command help', () => {
    const sentinel = 'github_pat_help_output_must_not_contain_this_value';
    const previousToken = process.env.PERSONAL_ACCESS_TOKEN;
    process.env.PERSONAL_ACCESS_TOKEN = sentinel;

    try {
      const help = [program.helpInformation(), ...program.commands.map((command) => command.helpInformation())].join('\n');
      expect(help).not.toContain(sentinel);
    } finally {
      if (previousToken === undefined) delete process.env.PERSONAL_ACCESS_TOKEN;
      else process.env.PERSONAL_ACCESS_TOKEN = previousToken;
    }
  });

  describe('think', () => {
    it('calls runLocalAction with think action and question from -q', async () => {
      await program.parseAsync(['node', 'cli', 'think', '-q', 'how does X work?']);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params[INPUT_KEYS.SINGLE_ACTION]).toBe(ACTIONS.THINK);
      expect(params).not.toHaveProperty(INPUT_KEYS.SINGLE_ACTION_ISSUE);
      expect(params).not.toHaveProperty(INPUT_KEYS.WELCOME_TITLE);
      expect(params.repo).toEqual({ owner: 'test-owner', repo: 'test-repo' });
      expect(params).toMatchObject({
        eventName: 'issue_comment',
        issue: {},
        comment: { body: 'how does X work?' },
      });
    });

    it('exits with error when getGitInfo fails', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('git not found');
      });
      const { logError } = require('../utils/logger');

      await program.parseAsync(['node', 'cli', 'think', '-q', 'hello']);

      expect(logError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('exits when getGitInfo returns non-GitHub URL', async () => {
      (execSync as jest.Mock).mockReturnValue(Buffer.from('https://gitlab.com/foo/bar.git'));
      const { logError } = require('../utils/logger');

      await program.parseAsync(['node', 'cli', 'think', '-q', 'hello']);

      expect(logError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe('doctor', () => {
    it('presents the report with its resolved catalog and returns a failing exit code when unhealthy', async () => {
      const catalog = { locale: 'es-ES', message: jest.fn() };
      const report = { healthy: false, checks: [], totals: { pass: 0, warn: 0, fail: 1, skipped: 0 } };
      mockDoctorExecute.mockResolvedValueOnce({ catalog, report });

      await program.parseAsync([
        'node',
        'cli',
        'doctor',
        '--non-interactive',
        '--token',
        'github_pat_doctor_test_token',
      ]);

      expect(mockDoctorExecute).toHaveBeenCalledWith(expect.objectContaining({
        owner: 'test-owner',
        repository: 'test-repo',
        setupToken: 'github_pat_doctor_test_token',
      }));
      expect(mockDoctorPresenter).toHaveBeenCalledWith(catalog);
      expect(mockDoctorPresent).toHaveBeenCalledWith(report);
      expect(process.exitCode).toBe(1);
    });
  });

  describe('do', () => {
    it('calls the fixer port and logs response', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      mockFix.mockResolvedValue({ text: 'OK', sessionId: 's1' });
      await program.parseAsync(['node', 'cli', 'do', '-p', 'refactor this']);

      expect(mockFix).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('RESPONSE'));
      logSpy.mockRestore();
    });

    it('includes repository identity and current branch in the OpenCode prompt', async () => {
      mockFix.mockResolvedValue({ text: 'OK', sessionId: 's1' });

      await program.parseAsync(['node', 'cli', 'do', '-p', 'refactor this']);

      const prompt = mockFix.mock.calls[0][0].prompt as string;
      expect(prompt).toContain('Repository identity: test-owner/test-repo');
      expect(prompt).toContain('Current branch:');
    });

    it('calls process.exit(1) when do fails', async () => {
      mockFix.mockRejectedValue(new Error('OpenCode down'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'hello']);

      expect(process.exitCode).toBe(1);
      const errMsg = consoleSpy.mock.calls.flat().join(' ');
      expect(errMsg).toContain('Unable to execute the request.');
      expect(errMsg).not.toContain('OpenCode down');
      consoleSpy.mockRestore();
    });

    it('exits when getGitInfo fails in do', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('git not found');
      });
      const { logError } = require('../utils/logger');
      (runLocalAction as jest.Mock).mockClear();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'hello']);

      expect(logError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(runLocalAction).not.toHaveBeenCalled();
    });

    it('exits when copilotMessage returns null', async () => {
      mockFix.mockResolvedValue(null);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'hello']);

      expect(process.exitCode).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Request failed'));
      consoleSpy.mockRestore();
    });

    it('logs a safe correlation reference and exits with debug when do throws', async () => {
      const err = new Error('OpenCode down');
      mockFix.mockRejectedValue(err);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'hello', '--debug']);

      expect(process.exitCode).toBe(1);
      const messages = consoleSpy.mock.calls.flat().map(String);
      expect(messages.some((m) => m.includes('Unable to execute the request.'))).toBe(true);
      expect(messages.some((m) => m.includes('Reference:'))).toBe(true);
      expect(messages).not.toContain(err.message);
      consoleSpy.mockRestore();
    });
  });

  describe('check-progress', () => {
    it('calls runLocalAction with CHECK_PROGRESS and issue number', async () => {
      await program.parseAsync(['node', 'cli', 'check-progress', '-i', '99']);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params[INPUT_KEYS.SINGLE_ACTION]).toBe(ACTIONS.CHECK_PROGRESS);
      expect(params[INPUT_KEYS.SINGLE_ACTION_ISSUE]).toBe(99);
      expect(params.issue?.number).toBe(99);
      expect(params.after).toBe('a'.repeat(40));
      expect(params[INPUT_KEYS.WELCOME_TITLE]).toContain('Progress');
    });

    it('shows message when issue number is invalid', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await program.parseAsync(['node', 'cli', 'check-progress', '-i', '0']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid issue number'));
      logSpy.mockRestore();
    });

    it('shows message when issue number is missing', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      (runLocalAction as jest.Mock).mockClear();

      await program.parseAsync(['node', 'cli', 'check-progress']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('issue number'));
      expect(runLocalAction).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('exits when getGitInfo fails in check-progress', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('git not found');
      });
      const { logError } = require('../utils/logger');

      await program.parseAsync(['node', 'cli', 'check-progress', '-i', '1']);

      expect(logError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('passes branch in params when -b is provided', async () => {
      await program.parseAsync(['node', 'cli', 'check-progress', '-i', '5', '-b', 'feature/foo']);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params.commits?.ref).toBe('refs/heads/feature/foo');
    });

    it('fails closed before local execution when the workspace revision is unavailable', async () => {
      (execSync as jest.Mock).mockImplementation((command: string) => {
        if (command === 'git rev-parse HEAD') throw new Error('missing head');
        return Buffer.from('https://github.com/test-owner/test-repo.git');
      });
      const { logError } = require('../utils/logger');

      await program.parseAsync(['node', 'cli', 'check-progress', '-i', '5']);

      expect(logError).toHaveBeenCalledWith('Unable to resolve the current Git revision for progress analysis.');
      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('omits the correlation reference outside debug mode for check-progress failures', async () => {
      (runLocalAction as jest.Mock).mockRejectedValueOnce(new Error('check-progress-secret-marker'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'check-progress', '-i', '1']);

      const messages = consoleSpy.mock.calls.flat().map(String);
      expect(messages).toContain('❌ Unable to check progress.');
      expect(messages.some((m) => m.includes('Reference:'))).toBe(false);
      expect(messages.some((m) => m.includes('check-progress-secret-marker'))).toBe(false);
      consoleSpy.mockRestore();
    });

    it('exits when runLocalAction rejects in check-progress', async () => {
      (runLocalAction as jest.Mock).mockRejectedValueOnce(new Error('check-progress-secret-marker'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'check-progress', '-i', '1', '--debug']);

      expect(process.exitCode).toBe(1);
      const messages = consoleSpy.mock.calls.flat().map(String);
      expect(messages.some((m) => m.includes('Unable to check progress.'))).toBe(true);
      expect(messages.some((m) => m.includes('Reference:'))).toBe(true);
      expect(messages.some((m) => m.includes('check-progress-secret-marker'))).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('recommend-steps', () => {
    it('calls runLocalAction with RECOMMEND_STEPS', async () => {
      await program.parseAsync(['node', 'cli', 'recommend-steps', '-i', '5']);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params[INPUT_KEYS.SINGLE_ACTION]).toBe(ACTIONS.RECOMMEND_STEPS);
      expect(params.issue?.number).toBe(5);
    });

    it('exits when getGitInfo fails', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('git not found');
      });
      const { logError } = require('../utils/logger');
      (runLocalAction as jest.Mock).mockClear();

      await program.parseAsync(['node', 'cli', 'recommend-steps', '-i', '1']);

      expect(logError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      const runCalls = (runLocalAction as jest.Mock).mock.calls;
      const ranWithValidRepo = runCalls.some((c) => c[0]?.repo?.owner && c[0]?.repo?.repo);
      expect(ranWithValidRepo).toBe(false);
    });

    it('shows message when issue number is invalid', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      (runLocalAction as jest.Mock).mockClear();

      await program.parseAsync(['node', 'cli', 'recommend-steps', '-i', 'x']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('valid issue number'));
      expect(runLocalAction).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('omits the correlation reference outside debug mode for recommend-steps failures', async () => {
      (runLocalAction as jest.Mock).mockRejectedValueOnce(new Error('recommend-secret-marker'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'recommend-steps', '-i', '1']);

      const messages = consoleSpy.mock.calls.flat().map(String);
      expect(messages).toContain('❌ Unable to recommend steps.');
      expect(messages.some((m) => m.includes('Reference:'))).toBe(false);
      expect(messages.some((m) => m.includes('recommend-secret-marker'))).toBe(false);
      consoleSpy.mockRestore();
    });

    it('does not expose a raw recommend-steps failure, including in debug mode', async () => {
      (runLocalAction as jest.Mock).mockRejectedValueOnce(new Error('recommend-secret-marker'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'recommend-steps', '-i', '1', '--debug']);

      expect(process.exitCode).toBe(1);
      const messages = consoleSpy.mock.calls.flat().map(String);
      expect(messages.some((m) => m.includes('Unable to recommend steps.'))).toBe(true);
      expect(messages.some((m) => m.includes('Reference:'))).toBe(true);
      expect(messages.some((m) => m.includes('recommend-secret-marker'))).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('setup', () => {
    // Token check: hasValidSetupToken/setupEnvFileExists and message variants are covered in
    // setup_files.test.ts and initial_setup_use_case.test.ts.
    it('calls runLocalAction with INITIAL_SETUP', async () => {
      await program.parseAsync([
        'node',
        'cli',
        'setup',
        '--token',
        'ghp_setup_test_token_xxxxxxxxxxxxxxxxxxxx',
        '--skip-secrets',
        '--non-interactive',
        '--pr-approval-mode',
        'off',
        '--yes',
      ]);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params[INPUT_KEYS.SINGLE_ACTION]).toBe(ACTIONS.INITIAL_SETUP);
      expect(params[INPUT_KEYS.TOKEN]).toBe('ghp_setup_test_token_xxxxxxxxxxxxxxxxxxxx');
      expect(params[INPUT_KEYS.WELCOME_TITLE]).toContain('Initial Setup');
      expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(2);
      expect(mockTokenPermissionInspect.mock.calls[1][0].requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: 'setup', permission: 'Metadata', applicability: 'required' }),
        expect.objectContaining({ role: 'setup', permission: 'Variables', applicability: 'required' }),
      ]));
    });

    it('proceeds when --token is provided even if env/.env has no token', async () => {
      await program.parseAsync(['node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12', '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes']);

      expect(exitSpy).not.toHaveBeenCalled();
      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params[INPUT_KEYS.TOKEN]).toBe('ghp_abcdefghijklmnopqrstuvwxyz12');
      expect(params[INPUT_KEYS.SINGLE_ACTION]).toBe(ACTIONS.INITIAL_SETUP);
    });

    it.each([
      { ready: false, identityStatus: 'valid' as const },
      { ready: true, identityStatus: 'invalid' as const },
    ])('stops before planning when the initial setup PAT report is $identityStatus/$ready', async (report) => {
      mockTokenPermissionInspect.mockResolvedValueOnce({
        role: 'setup',
        identityStatus: report.identityStatus,
        identityMessage: 'insufficient access',
        ready: report.ready,
        checks: [],
      });

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);

      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it.each([
      { ready: false, identityStatus: 'valid' as const },
      { ready: true, identityStatus: 'invalid' as const },
    ])('stops after planning when the configured setup PAT report is $identityStatus/$ready', async (report) => {
      mockTokenPermissionInspect
        .mockResolvedValueOnce({
          role: 'setup', identityStatus: 'valid', identityMessage: 'verified', ready: true, checks: [],
        })
        .mockResolvedValueOnce({
          role: 'setup',
          identityStatus: report.identityStatus,
          identityMessage: 'insufficient configured access',
          ready: report.ready,
          checks: [],
        });

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);

      expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(2);
      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('exits when not inside a git repo', async () => {
      (execSync as jest.Mock).mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('is-inside-work-tree')) throw new Error('not a repo');
        return Buffer.from('https://github.com/o/r.git');
      });

      await program.parseAsync(['node', 'cli', 'setup', '--non-interactive']);

      expect(process.exitCode).toBe(1);
      const { logError } = require('../utils/logger');
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Not a git repository'));
    });

    it('exits when getGitInfo returns error in setup', async () => {
      (execSync as jest.Mock).mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('is-inside-work-tree')) return Buffer.from('true');
        if (typeof cmd === 'string' && cmd.includes('remote.origin.url')) throw new Error('no remote');
        return Buffer.from('https://github.com/o/r.git');
      });
      const { logError } = require('../utils/logger');
      (runLocalAction as jest.Mock).mockClear();

      await program.parseAsync(['node', 'cli', 'setup', '--non-interactive']);

      expect(logError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      const runCalls = (runLocalAction as jest.Mock).mock.calls;
      const ranWithValidRepo = runCalls.length > 0 && runCalls[0][0]?.repo?.owner && runCalls[0][0]?.repo?.repo;
      expect(ranWithValidRepo).not.toBe(true);
    });

    it('exits when no valid setup token is available', async () => {
      mockGetSetupToken.mockReturnValue(undefined);
      const { logError, logInfo } = require('../utils/logger');
      (runLocalAction as jest.Mock).mockClear();

      await program.parseAsync(['node', 'cli', 'setup', '--non-interactive']);

      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Setup requires PERSONAL_ACCESS_TOKEN'));
      expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('PERSONAL_ACCESS_TOKEN'));
      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('does not offer local .env configuration when the setup token is missing', async () => {
      mockGetSetupToken.mockReturnValue(undefined);
      const { logError, logInfo } = require('../utils/logger');
      (runLocalAction as jest.Mock).mockClear();

      await program.parseAsync(['node', 'cli', 'setup', '--non-interactive']);

      expect(logError).toHaveBeenCalledWith(expect.stringContaining('Setup requires PERSONAL_ACCESS_TOKEN'));
      expect(logInfo).not.toHaveBeenCalledWith(expect.stringContaining('.env'));
      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('allows a tokenless dry run while still presenting both permission plans', async () => {
      mockGetSetupToken.mockReturnValue(undefined);

      await program.parseAsync([
        'node', 'cli', 'setup', '--dry-run', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);

      expect(mockTokenPermissionInspect).not.toHaveBeenCalled();
      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('detect-potential-problems', () => {
    it('calls runLocalAction with DETECT_POTENTIAL_PROBLEMS', async () => {
      await program.parseAsync(['node', 'cli', 'detect-potential-problems', '-i', '10']);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params[INPUT_KEYS.SINGLE_ACTION]).toBe(ACTIONS.DETECT_POTENTIAL_PROBLEMS);
      expect(params.issue?.number).toBe(10);
      expect(params[INPUT_KEYS.WELCOME_TITLE]).toContain('Detect potential problems');
    });

    it('shows message when issue number is missing or invalid', async () => {
      (runLocalAction as jest.Mock).mockClear();
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await program.parseAsync(['node', 'cli', 'detect-potential-problems', '-i', 'x']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('valid issue number'));
      expect(runLocalAction).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('exits when getGitInfo fails in detect-potential-problems', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('git not found');
      });
      const { logError } = require('../utils/logger');
      (runLocalAction as jest.Mock).mockClear();

      await program.parseAsync(['node', 'cli', 'detect-potential-problems', '-i', '1']);

      expect(logError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      const runCalls = (runLocalAction as jest.Mock).mock.calls;
      const ranWithValidRepo = runCalls.some((c) => c[0]?.repo?.owner && c[0]?.repo?.repo);
      expect(ranWithValidRepo).toBe(false);
    });

    it('uses getCurrentBranch when -b is not provided', async () => {
      (execSync as jest.Mock).mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('rev-parse') && cmd.includes('abbrev-ref'))
          return Buffer.from('feature/xyz');
        return Buffer.from('https://github.com/test-owner/test-repo.git');
      });

      await program.parseAsync(['node', 'cli', 'detect-potential-problems', '-i', '3']);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params.commits?.ref).toBe('refs/heads/feature/xyz');
    });

    it('exits when runLocalAction rejects in detect-potential-problems', async () => {
      (runLocalAction as jest.Mock).mockRejectedValueOnce(new Error('detect-secret-marker'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'detect-potential-problems', '-i', '1', '--debug']);

      expect(process.exitCode).toBe(1);
      const messages = consoleSpy.mock.calls.flat().map(String);
      expect(messages.some((m) => m.includes('Unable to run detect-potential-problems.'))).toBe(true);
      expect(messages.some((m) => m.includes('Reference:'))).toBe(true);
      expect(messages.some((m) => m.includes('detect-secret-marker'))).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('do --output json', () => {
    it('prints JSON when --output json', async () => {
      mockFix.mockResolvedValue({ text: 'Hi', sessionId: 'sid-1' });
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'hello', '--output', 'json']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"response":'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"sessionId":'));
      logSpy.mockRestore();
    });
  });
});
