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
  runLocalAction: jest.fn().mockResolvedValue([]),
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
  confirmationRequired: false,
  checks: request.requirements.map(requirement => ({ ...requirement, status: 'verified', message: 'available' })),
}));
jest.mock('../infrastructure/composition/setup_token_permissions_composition_root', () => ({
  createSetupTokenPermissionsUseCase: () => ({ inspect: mockTokenPermissionInspect }),
}));

const defaultRemoteConfiguration = {
  ownerType: 'User',
  repositoryVisibility: 'private',
  repositorySecrets: [],
  repositorySecretsAccess: 'available',
  organizationSecrets: [],
  repositoryVariables: [],
  repositoryVariablesAccess: 'available',
  organizationVariables: [],
  organizationAccess: 'not_applicable',
  organizationSecretsAccess: 'not_applicable',
  organizationVariablesAccess: 'not_applicable',
};
const mockRemoteConfigurationInspect = jest.fn().mockResolvedValue(defaultRemoteConfiguration);
const mockSetupCredentialsCollect = jest.fn().mockResolvedValue({
  collection: { apiKeys: [] }, checks: [], existingSecretNames: [],
});
jest.mock('../infrastructure/composition/setup_credentials_composition_root', () => ({
  createSetupCredentialsUseCase: () => ({ collect: mockSetupCredentialsCollect }),
  createSetupRemoteConfigurationReadPort: () => ({
    inspect: mockRemoteConfigurationInspect,
  }),
}));

describe('CLI', () => {
  let exitSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetupCredentialsCollect.mockResolvedValue({ collection: { apiKeys: [] }, checks: [], existingSecretNames: [] });
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
    (runLocalAction as jest.Mock).mockResolvedValue([]);
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
    beforeEach(() => {
      const setupCommand = program.commands.find(command => command.name() === 'setup')!;
      for (const option of setupCommand.options) {
        setupCommand.setOptionValue(option.attributeName(), option.defaultValue);
      }
    });
    const guidedTerminal = (answer?: (prompt: string) => string | undefined) => ({
      isInteractive: () => true,
      readText: jest.fn(async (prompt: string) => ({ kind: 'value' as const, value: answer?.(prompt)
        ?? (prompt.includes('repository owner an organization') ? '2'
          : prompt.includes('Review these intended grants') ? '1' : '') })),
      readSecret: jest.fn().mockResolvedValue({ kind: 'value', value: 'github_pat_guided_setup_test_token' }),
      close: jest.fn(),
    });

    const acceptedSetupPatReport = () => ({
      role: 'setup' as const, identityStatus: 'valid' as const, identityMessage: 'verified',
      account: 'operator', ready: true, confirmationRequired: false, checks: [],
    });

    it('carries guided intent through the final audit and prepares the separate bot link', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const promptModule = require('../cli/setup_credential_prompt_adapter') as typeof import('../cli/setup_credential_prompt_adapter');
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      const botGuide = jest.spyOn(promptModule.SetupCredentialPromptAdapter.prototype, 'configureWorkflowPatGuide');
      mockTokenPermissionInspect.mockResolvedValueOnce(acceptedSetupPatReport());
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(2);
        expect(mockTokenPermissionInspect.mock.calls[0][0].requirements).toEqual(expect.arrayContaining([
          expect.objectContaining({ scope: 'repository', permission: 'Contents', level: 'write', applicability: 'required' }),
        ]));
        expect(botGuide).toHaveBeenCalledTimes(1);
        expect(runLocalAction).toHaveBeenCalledTimes(1);
        expect(process.exitCode).toBeUndefined();
      } finally {
        botGuide.mockRestore();
        createTerminal.mockRestore();
      }
    });

    it('falls back to manual PAT entry when the owner kind cannot be confirmed', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const input = guidedTerminal(prompt => prompt.includes('repository owner an organization') ? '3' : '');
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce({ ...acceptedSetupPatReport(), ready: false });
      try {
        await program.parseAsync(['node', 'cli', 'setup']);
        const { logInfo } = require('../utils/logger');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Owner type was not confirmed'));
        expect(input.readText).not.toHaveBeenCalledWith(expect.stringContaining('Review these intended grants'));
        expect(input.readSecret).toHaveBeenCalledWith('Setup PAT');
        expect(consoleLogSpy.mock.calls.flat().join('\n')).not.toContain('Revoke temporary setup PAT');
        expect(process.exitCode).toBe(1);
      } finally { createTerminal.mockRestore(); }
    });

    it('allows the operator to choose manual entry after reviewing local intent', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const input = guidedTerminal(prompt => prompt.includes('Review these intended grants') ? '3'
        : prompt.includes('repository owner an organization') ? '2' : '');
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce({ ...acceptedSetupPatReport(), ready: false });
      try {
        await program.parseAsync(['node', 'cli', 'setup']);
        expect(input.readSecret).toHaveBeenCalledWith('Setup PAT');
        expect(consoleLogSpy.mock.calls.flat().join('\n')).not.toContain('Revoke temporary setup PAT');
        expect(process.exitCode).toBe(1);
      } finally { createTerminal.mockRestore(); }
    });

    it('revises permission intent before the link and drops the initial-tag write grant', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      let reviews = 0;
      let tags = 0;
      const input = guidedTerminal(prompt => {
        if (prompt.includes('repository owner an organization')) return '2';
        if (prompt.includes('Review these intended grants')) return ++reviews === 1 ? '2' : '1';
        if (prompt.includes('Create v1.0.0')) return ++tags === 2 ? 'no' : '';
        return '';
      });
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce({ ...acceptedSetupPatReport(), ready: false });
      try {
        await program.parseAsync(['node', 'cli', 'setup']);
        expect(reviews).toBe(2);
        expect(tags).toBe(2);
        expect(mockTokenPermissionInspect.mock.calls[0][0].requirements).toEqual(expect.arrayContaining([
          expect.objectContaining({ permission: 'Contents', level: 'read' }),
        ]));
        expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain('contents=read');
        expect(process.exitCode).toBe(1);
      } finally { createTerminal.mockRestore(); }
    });

    it('blocks a personal owner paired with organization storage before requesting a PAT', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--secrets-scope', 'organization']);
        const { logInfo } = require('../utils/logger');
        expect((logInfo as jest.Mock).mock.calls.flat()).toContainEqual(expect.stringContaining('declared a personal account'));
        expect(input.readSecret).not.toHaveBeenCalled();
        expect(runLocalAction).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      } finally { createTerminal.mockRestore(); }
    });

    it('reports invalid fixed local configuration before making a guided PAT link', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const configFile = require('../cli/setup_config_file') as typeof import('../cli/setup_config_file');
      const loadConfig = jest.spyOn(configFile, 'loadSetupConfigurationOverrides')
        .mockReturnValue({ repository: { mainBranch: 'invalid branch' } });
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--config', 'invalid-local-config.yml', '--pr-approval-mode', 'off']);
        const { logInfo } = require('../utils/logger');
        expect((logInfo as jest.Mock).mock.calls.flat()).toContainEqual(expect.stringContaining('configuration needs correction'));
        expect(input.readSecret).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      } finally { loadConfig.mockRestore(); createTerminal.mockRestore(); }
    });

    it('accepts a minimal personal-repository intent without asking the owner kind', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const input = guidedTerminal(prompt => {
        if (prompt.includes('Issue automation:') || prompt.includes('Pull request automation:')
          || prompt.includes('Create v1.0.0') || prompt.includes('Create/update GitHub Actions Variables?')
          || prompt.includes('Validate and provision required GitHub Actions Secrets?')) return 'no';
        if (prompt.includes('Review these intended grants')) return '1';
        return '';
      });
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce({ ...acceptedSetupPatReport(), ready: false });
      try {
        await program.parseAsync(['node', 'cli', 'setup']);
        expect(input.readText.mock.calls.some(([prompt]) => String(prompt).includes('repository owner an organization'))).toBe(false);
        expect(mockTokenPermissionInspect.mock.calls[0][0].requirements.map((item: SetupTokenPermissionRequirement) => item.permission))
          .toEqual(['Metadata', 'Contents']);
        expect(process.exitCode).toBe(1);
      } finally { createTerminal.mockRestore(); }
    });

    it('describes an explicitly empty issue-workflow selection as none', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const configFile = require('../cli/setup_config_file') as typeof import('../cli/setup_config_file');
      const loadConfig = jest.spyOn(configFile, 'loadSetupConfigurationOverrides')
        .mockReturnValue({ issueWorkflows: { enabled: [] }, pullRequestApproval: { mode: 'off' } });
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--config', 'empty-issue-workflows.yml']);
        const { logInfo } = require('../utils/logger');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('issue workflows: none'));
      } finally { loadConfig.mockRestore(); createTerminal.mockRestore(); }
    });

    it('falls back to manual entry when the setup PAT form cannot express a grant', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const urlPolicy = require('../application/policies/setup_pat_creation_url_policy') as typeof import('../application/policies/setup_pat_creation_url_policy');
      const buildLink = jest.spyOn(urlPolicy, 'buildSetupPatCreationUrl')
        .mockImplementation(() => { throw new urlPolicy.UnsupportedSetupPatLinkError(['repository Unsupported write']); });
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce({ ...acceptedSetupPatReport(), ready: false });
      try {
        await program.parseAsync(['node', 'cli', 'setup']);
        const { logInfo } = require('../utils/logger');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('guided setup PAT link is unavailable'));
        expect(input.readSecret).toHaveBeenCalledWith('Setup PAT');
        expect(consoleLogSpy.mock.calls.flat().join('\n')).not.toContain('Revoke temporary setup PAT');
        expect(process.exitCode).toBe(1);
      } finally { buildLink.mockRestore(); createTerminal.mockRestore(); }
    });

    it('does not turn an unexpected setup-link failure into a misleading manual fallback', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const urlPolicy = require('../application/policies/setup_pat_creation_url_policy') as typeof import('../application/policies/setup_pat_creation_url_policy');
      const buildLink = jest.spyOn(urlPolicy, 'buildSetupPatCreationUrl')
        .mockImplementation(() => { throw new Error('unexpected link failure'); });
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      try {
        await program.parseAsync(['node', 'cli', 'setup']);
        expect(input.readSecret).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      } finally { buildLink.mockRestore(); createTerminal.mockRestore(); }
    });

    it('retains setup progress when the final bot PAT form is unsupported', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const urlPolicy = require('../application/policies/setup_pat_creation_url_policy') as typeof import('../application/policies/setup_pat_creation_url_policy');
      const original = urlPolicy.buildSetupPatCreationUrl;
      const buildLink = jest.spyOn(urlPolicy, 'buildSetupPatCreationUrl')
        .mockImplementation(input => input.role === 'workflow'
          ? (() => { throw new urlPolicy.UnsupportedSetupPatLinkError(['repository Checks read']); })()
          : original(input));
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce(acceptedSetupPatReport());
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        const { logInfo } = require('../utils/logger');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('guided fine-grained bot PAT link is unavailable'));
        expect(runLocalAction).toHaveBeenCalledTimes(1);
      } finally { buildLink.mockRestore(); createTerminal.mockRestore(); }
    });

    it('surfaces an unexpected bot-link failure instead of silently entering manual mode', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const urlPolicy = require('../application/policies/setup_pat_creation_url_policy') as typeof import('../application/policies/setup_pat_creation_url_policy');
      const original = urlPolicy.buildSetupPatCreationUrl;
      const buildLink = jest.spyOn(urlPolicy, 'buildSetupPatCreationUrl')
        .mockImplementation(input => {
          if (input.role === 'workflow') throw new Error('unexpected bot link failure');
          return original(input);
        });
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce(acceptedSetupPatReport());
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        expect(runLocalAction).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      } finally { buildLink.mockRestore(); createTerminal.mockRestore(); }
    });

    it('blocks a guided plan when GitHub reports a different owner kind', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const input = guidedTerminal(prompt => prompt.includes('repository owner an organization') ? '1' : undefined);
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce(acceptedSetupPatReport());
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        const { logInfo } = require('../utils/logger');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('GitHub reports User'));
        expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain('Setup PAT permissions changed');
        expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(1);
        expect(runLocalAction).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      } finally { createTerminal.mockRestore(); }
    });

    it('shows the corrected grants and blocks before mutation when the final PAT audit fails', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect
        .mockResolvedValueOnce(acceptedSetupPatReport())
        .mockResolvedValueOnce({ ...acceptedSetupPatReport(), ready: false });
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(2);
        expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain('Setup PAT permissions changed');
        expect(runLocalAction).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      } finally { createTerminal.mockRestore(); }
    });

    it('lists remote-only grants added after discovering an existing Secret', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockRemoteConfigurationInspect.mockResolvedValueOnce({
        ...defaultRemoteConfiguration,
        repositorySecrets: ['PAT'],
      });
      mockTokenPermissionInspect
        .mockResolvedValueOnce(acceptedSetupPatReport())
        .mockResolvedValueOnce({ ...acceptedSetupPatReport(), ready: false });
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off']);
        const output = consoleLogSpy.mock.calls.flat().join('\n');
        expect(output).toContain('Setup PAT permissions changed');
        expect(output).toContain('repository Actions write');
        expect(runLocalAction).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      } finally { createTerminal.mockRestore(); }
    });

    it('warns about excess organization grants if remote owner type cannot be resolved', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const input = guidedTerminal(prompt => prompt.includes('repository owner an organization') ? '1' : undefined);
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockRemoteConfigurationInspect.mockResolvedValueOnce({ ...defaultRemoteConfiguration, ownerType: 'Unknown' });
      mockTokenPermissionInspect.mockResolvedValueOnce(acceptedSetupPatReport());
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        const { logInfo } = require('../utils/logger');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('PAT may have excess access'));
      } finally { createTerminal.mockRestore(); }
    });

    it.each([
      ['operator', true], ['separate-bot', false],
    ])('verifies the guided bot PAT account @%s before applying setup', async (login, reusedAccount) => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const promptModule = require('../cli/setup_credential_prompt_adapter') as typeof import('../cli/setup_credential_prompt_adapter');
      const identityModule = require('../infrastructure/setup_github_identity_query_adapter') as typeof import('../infrastructure/setup_github_identity_query_adapter');
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      const botIdentity = jest.spyOn(promptModule.SetupCredentialPromptAdapter.prototype, 'guidedWorkflowBotIdentity', 'get')
        .mockReturnValue({ id: 42, login });
      const identify = jest.spyOn(identityModule.SetupGithubIdentityQueryAdapter.prototype, 'identify')
        .mockResolvedValue({ id: 42, login });
      mockSetupCredentialsCollect.mockResolvedValueOnce({
        collection: { apiKeys: [], workflowPat: { name: 'PAT', value: 'bot-pat' } }, checks: [], existingSecretNames: [],
      });
      mockTokenPermissionInspect.mockResolvedValueOnce(acceptedSetupPatReport());
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        const { logInfo } = require('../utils/logger');
        expect(identify).toHaveBeenCalledWith('bot-pat');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining(`Workflow PAT owner verified as @${login}`));
        expect((logInfo as jest.Mock).mock.calls.flat().some((message: unknown) => String(message).includes('same GitHub account')))
          .toBe(reusedAccount);
        expect(runLocalAction).toHaveBeenCalledTimes(1);
      } finally { identify.mockRestore(); botIdentity.mockRestore(); createTerminal.mockRestore(); }
    });

    it('does not mutate when the guided bot PAT identity check fails', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const promptModule = require('../cli/setup_credential_prompt_adapter') as typeof import('../cli/setup_credential_prompt_adapter');
      const identityModule = require('../infrastructure/setup_github_identity_query_adapter') as typeof import('../infrastructure/setup_github_identity_query_adapter');
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      const botIdentity = jest.spyOn(promptModule.SetupCredentialPromptAdapter.prototype, 'guidedWorkflowBotIdentity', 'get')
        .mockReturnValue({ id: 42, login: 'bot-account' });
      const identify = jest.spyOn(identityModule.SetupGithubIdentityQueryAdapter.prototype, 'identify')
        .mockResolvedValue({ id: 43, login: 'wrong-account' });
      mockSetupCredentialsCollect.mockResolvedValueOnce({
        collection: { apiKeys: [], workflowPat: { name: 'PAT', value: 'bot-pat' } }, checks: [], existingSecretNames: [],
      });
      mockTokenPermissionInspect.mockResolvedValueOnce(acceptedSetupPatReport());
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        const { logInfo } = require('../utils/logger');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('No setup mutation started'));
        expect(runLocalAction).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      } finally { identify.mockRestore(); botIdentity.mockRestore(); createTerminal.mockRestore(); }
    });

    it('warns that a guided bot PAT may be stored if applying setup fails', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const promptModule = require('../cli/setup_credential_prompt_adapter') as typeof import('../cli/setup_credential_prompt_adapter');
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      const botIdentity = jest.spyOn(promptModule.SetupCredentialPromptAdapter.prototype, 'guidedWorkflowBotIdentity', 'get')
        .mockReturnValue({ id: 42, login: 'bot-account' });
      mockTokenPermissionInspect.mockResolvedValueOnce(acceptedSetupPatReport());
      (runLocalAction as jest.Mock).mockRejectedValueOnce(new Error('setup failed after mutation started'));
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        const { logInfo } = require('../utils/logger');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Setup may be partially applied'));
        expect(process.exitCode).toBe(1);
      } finally { botIdentity.mockRestore(); createTerminal.mockRestore(); }
    });

    it('reports partial completion when an action succeeds but returns errors', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const input = guidedTerminal();
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(input as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce(acceptedSetupPatReport());
      (runLocalAction as jest.Mock).mockResolvedValueOnce([{ success: true, errors: ['partial failure'] }]);
      try {
        await program.parseAsync(['node', 'cli', 'setup', '--yes', '--pr-approval-mode', 'off', '--skip-secrets']);
        const { logInfo } = require('../utils/logger');
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('partial completion'));
        expect(process.exitCode).toBe(1);
      } finally { createTerminal.mockRestore(); }
    });
    it('offers the guided setup PAT link and a repair link when its initial audit fails', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const terminal = {
        isInteractive: () => true,
        readText: jest.fn(async (prompt: string) => ({ kind: 'value', value: prompt.includes('repository owner an organization') || prompt.includes('Review these intended grants') ? '1' : '' })),
        readSecret: jest.fn().mockResolvedValue({ kind: 'value', value: 'github_pat_guided_setup_test_token' }),
        close: jest.fn(),
      };
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(terminal as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce({
        role: 'setup', identityStatus: 'valid', identityMessage: 'verified',
        ready: false, confirmationRequired: false, checks: [],
      });

      try {
        await program.parseAsync(['node', 'cli', 'setup']);

        expect(terminal.readText).toHaveBeenCalledWith(expect.stringContaining('How would you like to provide the setup PAT?'));
        expect(terminal.readSecret).toHaveBeenCalledWith('Setup PAT');
        const output = consoleLogSpy.mock.calls.flat().join('\n');
        expect(output).toContain('Setup PAT access needs attention');
        expect(output).toContain('Revoke temporary setup PAT');
        expect(output).toContain('contents=write');
        expect(output).toContain('issue_types=write');
        expect(output).toContain('Only select repositories');
        expect(runLocalAction).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
        expect(terminal.close).toHaveBeenCalledTimes(1);
      } finally {
        createTerminal.mockRestore();
      }
    });

    it('keeps manual PAT entry free of pre-PAT questions and guided cleanup claims', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const terminal = {
        isInteractive: () => true,
        readText: jest.fn().mockResolvedValue({ kind: 'value', value: '2' }),
        readSecret: jest.fn().mockResolvedValue({ kind: 'value', value: 'ghp_manual_setup_test_token' }),
        close: jest.fn(),
      };
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(terminal as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce({
        role: 'setup', identityStatus: 'valid', identityMessage: 'verified',
        ready: false, confirmationRequired: false, checks: [],
      });
      try {
        await program.parseAsync(['node', 'cli', 'setup']);
        expect(terminal.readText).toHaveBeenCalledTimes(1);
        expect(terminal.readSecret).toHaveBeenCalledWith('Setup PAT');
        expect(consoleLogSpy.mock.calls.flat().join('\n')).not.toContain('Revoke temporary setup PAT');
        expect(runLocalAction).not.toHaveBeenCalled();
      } finally {
        createTerminal.mockRestore();
      }
    });

    it('exits cleanly when permission intent is cancelled before a GitHub link exists', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const terminal = {
        isInteractive: () => true,
        readText: jest.fn()
          .mockResolvedValueOnce({ kind: 'value', value: '' })
          .mockResolvedValueOnce({ kind: 'end-of-input' }),
        readSecret: jest.fn(),
        close: jest.fn(),
      };
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(terminal as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      try {
        await program.parseAsync(['node', 'cli', 'setup']);
        expect(terminal.readSecret).not.toHaveBeenCalled();
        expect(consoleLogSpy.mock.calls.flat().join('\n')).not.toContain('Revoke temporary setup PAT');
        expect(runLocalAction).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(130);
      } finally {
        createTerminal.mockRestore();
      }
    });

    it('stops before planning if the guided setup PAT belongs to an unintended account', async () => {
      const terminalDriver = require('../cli/setup_terminal_driver') as typeof import('../cli/setup_terminal_driver');
      const terminal = {
        isInteractive: () => true,
        readText: jest.fn(async (prompt: string) => ({ kind: 'value', value: prompt.includes('Is this the account you intended') ? '2' : prompt.includes('repository owner an organization') || prompt.includes('Review these intended grants') ? '1' : '' })),
        readSecret: jest.fn().mockResolvedValue({ kind: 'value', value: 'github_pat_guided_setup_test_token' }),
        close: jest.fn(),
      };
      const createTerminal = jest.spyOn(terminalDriver, 'createInteractiveTerminalDriver')
        .mockReturnValue(terminal as unknown as ReturnType<typeof terminalDriver.createInteractiveTerminalDriver>);
      mockTokenPermissionInspect.mockResolvedValueOnce({
        role: 'setup', identityStatus: 'valid', identityMessage: 'verified',
        account: 'wrong-account', ready: true, confirmationRequired: false, checks: [],
      });

      try {
        await program.parseAsync(['node', 'cli', 'setup']);

        expect(terminal.readText).toHaveBeenCalledWith(expect.stringContaining('Is this the account you intended to configure with?'));
        expect(runLocalAction).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
        expect(terminal.close).toHaveBeenCalledTimes(1);
      } finally {
        createTerminal.mockRestore();
      }
    });

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

    it('reports partial application when the local setup action returns a failed result', async () => {
      (runLocalAction as jest.Mock).mockResolvedValueOnce([{ success: false, errors: [] }]);
      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);
      const { logInfo } = require('../utils/logger');
      expect(runLocalAction).toHaveBeenCalledTimes(1);
      expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Secret may already have been written'));
      expect(process.exitCode).toBe(1);
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
        confirmationRequired: false,
        checks: [],
      });

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);

      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('does not treat --yes as acknowledgement of unverifiable required writes', async () => {
      const requiredWrite: SetupTokenPermissionRequirement = {
        id: 'setup.repository.contents', role: 'setup', scope: 'repository', permission: 'Contents',
        level: 'write', applicability: 'required', reason: 'Create repository content.', probe: 'contents',
      };
      mockTokenPermissionInspect.mockResolvedValueOnce({
        role: 'setup', identityStatus: 'valid', identityMessage: 'verified',
        ready: false, confirmationRequired: true,
        checks: [{ ...requiredWrite, status: 'unverifiable', message: 'no safe write proof' }],
      });

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);

      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('accepts the dedicated non-interactive acknowledgement for required writes', async () => {
      const requiredWrite: SetupTokenPermissionRequirement = {
        id: 'setup.repository.contents', role: 'setup', scope: 'repository', permission: 'Contents',
        level: 'write', applicability: 'required', reason: 'Create repository content.', probe: 'contents',
      };
      mockTokenPermissionInspect.mockResolvedValueOnce({
        role: 'setup', identityStatus: 'valid', identityMessage: 'verified',
        ready: false, confirmationRequired: true,
        checks: [{ ...requiredWrite, status: 'unverifiable', message: 'no safe write proof' }],
      });

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
        '--confirm-unverifiable-write-permissions',
      ]);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBeUndefined();
    });

    it('requires acknowledgement again when only the final permission audit is unverifiable', async () => {
      const requiredWrite: SetupTokenPermissionRequirement = {
        id: 'setup.repository.variables', role: 'setup', scope: 'repository', permission: 'Variables',
        level: 'write', applicability: 'required', reason: 'Provision repository variables.', probe: 'variables',
      };
      mockTokenPermissionInspect
        .mockResolvedValueOnce({
          role: 'setup', identityStatus: 'valid', identityMessage: 'verified',
          ready: true, confirmationRequired: false, checks: [],
        })
        .mockResolvedValueOnce({
          role: 'setup', identityStatus: 'valid', identityMessage: 'verified',
          ready: false, confirmationRequired: true,
          checks: [{ ...requiredWrite, status: 'unverifiable', message: 'no safe write proof' }],
        });

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
        '--confirm-unverifiable-write-permissions',
      ]);

      expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(2);
      expect(runLocalAction).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBeUndefined();
    });

    it.each([
      { ready: false, identityStatus: 'valid' as const },
      { ready: true, identityStatus: 'invalid' as const },
    ])('stops after planning when the configured setup PAT report is $identityStatus/$ready', async (report) => {
      mockTokenPermissionInspect
        .mockResolvedValueOnce({
          role: 'setup', identityStatus: 'valid', identityMessage: 'verified', ready: true, confirmationRequired: false, checks: [],
        })
        .mockResolvedValueOnce({
          role: 'setup',
          identityStatus: report.identityStatus,
          identityMessage: 'insufficient configured access',
          ready: report.ready,
          confirmationRequired: false,
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

    it('continues past a missing conditional permission but blocks it when the final plan requires it', async () => {
      const conditionalVariables: SetupTokenPermissionRequirement = {
        id: 'setup.repository.variables',
        role: 'setup',
        scope: 'repository',
        permission: 'Variables',
        level: 'write',
        applicability: 'conditional',
        condition: 'Variable provisioning enabled',
        reason: 'Inspect and provision selected GitHub Actions Variables.',
        probe: 'variables',
      };
      mockTokenPermissionInspect
        .mockResolvedValueOnce({
          role: 'setup',
          identityStatus: 'valid',
          identityMessage: 'verified',
          ready: true,
          confirmationRequired: false,
          checks: [{ ...conditionalVariables, status: 'missing', message: 'not granted' }],
        })
        .mockImplementationOnce(async (request: { role: 'setup' | 'workflow'; requirements: readonly SetupTokenPermissionRequirement[] }) => ({
          role: request.role,
          identityStatus: 'valid',
          identityMessage: 'verified',
          ready: false,
          confirmationRequired: false,
          checks: request.requirements.map(requirement => ({
            ...requirement,
            status: requirement.probe === 'variables' ? 'missing' as const : 'verified' as const,
            message: requirement.probe === 'variables' ? 'not granted' : 'available',
          })),
        }));

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);

      expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(2);
      expect(mockTokenPermissionInspect.mock.calls[1][0].requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({ permission: 'Variables', applicability: 'required' }),
      ]));
      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('shows the final permission report before blocking unavailable managed inventory', async () => {
      mockRemoteConfigurationInspect.mockResolvedValueOnce({
        ownerType: 'User',
        repositoryVisibility: 'private',
        repositorySecrets: [],
        repositorySecretsAccess: 'available',
        organizationSecrets: [],
        repositoryVariables: [],
        repositoryVariablesAccess: 'unavailable',
        organizationVariables: [],
        organizationAccess: 'not_applicable',
        organizationSecretsAccess: 'not_applicable',
        organizationVariablesAccess: 'not_applicable',
      });

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);

      expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(2);
      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      const { logError } = require('../utils/logger');
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Repository Variable inventory is unavailable'),
      }));
    });

    it('shows the final permission report before surfacing organization storage validation', async () => {
      mockRemoteConfigurationInspect.mockResolvedValueOnce({
        ownerType: 'Organization',
        repositoryId: 42,
        repositoryVisibility: 'private',
        repositorySecrets: [],
        repositorySecretsAccess: 'available',
        organizationSecrets: [],
        repositoryVariables: [],
        repositoryVariablesAccess: 'available',
        organizationVariables: [],
        organizationAccess: 'unavailable',
        organizationSecretsAccess: 'available',
        organizationVariablesAccess: 'unavailable',
      });

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--variable-scope', 'AGENT_PROVIDER=organization',
        '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);

      expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(2);
      expect(mockTokenPermissionInspect.mock.calls[1][0].requirements).toEqual(expect.arrayContaining([
        expect.objectContaining({ scope: 'organization', permission: 'Variables' }),
      ]));
      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      const { logError } = require('../utils/logger');
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('organization variables'),
      }));
    });

    it('surfaces a blocked setup plan after completing its final permission and inventory audits', async () => {
      mockRemoteConfigurationInspect.mockResolvedValueOnce({
        ownerType: 'Organization',
        repositoryVisibility: 'private',
        repositorySecrets: [],
        repositorySecretsAccess: 'available',
        organizationSecrets: [],
        repositoryVariables: [],
        repositoryVariablesAccess: 'available',
        organizationVariables: [],
        organizationAccess: 'available',
        organizationSecretsAccess: 'available',
        organizationVariablesAccess: 'available',
      });

      await program.parseAsync([
        'node', 'cli', 'setup', '--token', 'ghp_abcdefghijklmnopqrstuvwxyz12',
        '--skip-secrets', '--variable-scope', 'AGENT_PROVIDER=organization',
        '--non-interactive', '--pr-approval-mode', 'off', '--yes',
      ]);

      expect(mockTokenPermissionInspect).toHaveBeenCalledTimes(2);
      expect(runLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      const { logError } = require('../utils/logger');
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('repository ID is required'),
      }));
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
