/**
 * Unit tests for CLI commands.
 * Mocks execSync (getGitInfo), runLocalAction, IssueRepository, AiRepository.
 */

import { execSync } from 'child_process';
import { program } from '../cli';
import { runLocalAction } from '../actions/local_action';
import { ACTIONS, INPUT_KEYS } from '../utils/constants';

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
jest.mock('../data/repository/issue_repository', () => ({
  IssueRepository: jest.fn().mockImplementation(() => ({
    isIssue: mockIsIssue,
  })),
}));

jest.mock('../data/repository/ai_repository', () => ({
  AiRepository: jest.fn().mockImplementation(() => ({
    copilotMessage: jest.fn().mockResolvedValue({ text: 'OK', sessionId: 's1' }),
  })),
}));

describe('CLI', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    (execSync as jest.Mock).mockReturnValue(Buffer.from('https://github.com/test-owner/test-repo.git'));
    (runLocalAction as jest.Mock).mockResolvedValue(undefined);
    mockIsIssue.mockResolvedValue(true);
  });

  afterEach(() => {
    exitSpy?.mockRestore();
  });

  describe('think', () => {
    it('calls runLocalAction with think action and question from -q', async () => {
      await program.parseAsync(['node', 'cli', 'think', '-q', 'how does X work?']);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params[INPUT_KEYS.SINGLE_ACTION]).toBe(ACTIONS.THINK);
      expect(params[INPUT_KEYS.WELCOME_TITLE]).toContain('AI Reasoning');
      expect(params.repo).toEqual({ owner: 'test-owner', repo: 'test-repo' });
      expect(params.comment?.body || params.eventName).toBeDefined();
    });

    it('exits with error when getGitInfo fails', async () => {
      (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('git not found');
      });
      const { logError } = require('../utils/logger');

      await program.parseAsync(['node', 'cli', 'think', '-q', 'hello']);

      expect(logError).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('exits when getGitInfo returns non-GitHub URL', async () => {
      (execSync as jest.Mock).mockReturnValue(Buffer.from('https://gitlab.com/foo/bar.git'));
      const { logError } = require('../utils/logger');

      await program.parseAsync(['node', 'cli', 'think', '-q', 'hello']);

      expect(logError).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('do', () => {
    it('calls AiRepository and logs response', async () => {
      const { AiRepository } = require('../data/repository/ai_repository');
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'refactor this']);

      expect(AiRepository).toHaveBeenCalled();
      const instance = AiRepository.mock.results[AiRepository.mock.results.length - 1].value;
      expect(instance.copilotMessage).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('RESPONSE'));
      logSpy.mockRestore();
    });

    it('calls process.exit(1) when do fails', async () => {
      const { AiRepository } = require('../data/repository/ai_repository');
      AiRepository.mockImplementation(() => ({
        copilotMessage: jest.fn().mockRejectedValue(new Error('OpenCode down')),
      }));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'hello']);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleSpy).toHaveBeenCalled();
      const errMsg = consoleSpy.mock.calls.flat().join(' ');
      expect(errMsg).toMatch(/error|Error/i);
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
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(runLocalAction).not.toHaveBeenCalled();
    });

    it('exits when copilotMessage returns null', async () => {
      const { AiRepository } = require('../data/repository/ai_repository');
      AiRepository.mockImplementation(() => ({
        copilotMessage: jest.fn().mockResolvedValue(null),
      }));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'hello']);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Request failed'));
      consoleSpy.mockRestore();
    });

    it('logs error and exits with debug when do throws and --debug', async () => {
      const err = new Error('OpenCode down');
      const { AiRepository } = require('../data/repository/ai_repository');
      AiRepository.mockImplementation(() => ({
        copilotMessage: jest.fn().mockRejectedValue(err),
      }));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'hello', '--debug']);

      expect(exitSpy).toHaveBeenCalledWith(1);
      const messages = consoleSpy.mock.calls.flat().map(String);
      expect(messages.some((m) => m.includes('Error executing do'))).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(err);
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
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('passes branch in params when -b is provided', async () => {
      await program.parseAsync(['node', 'cli', 'check-progress', '-i', '5', '-b', 'feature/foo']);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params.commits?.ref).toBe('refs/heads/feature/foo');
    });

    it('exits when runLocalAction rejects in check-progress', async () => {
      (runLocalAction as jest.Mock).mockRejectedValueOnce(new Error('API error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'check-progress', '-i', '1']);

      expect(exitSpy).toHaveBeenCalledWith(1);
      const messages = consoleSpy.mock.calls.flat().map(String);
      expect(messages.some((m) => m.includes('Error checking progress'))).toBe(true);
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
      expect(exitSpy).toHaveBeenCalledWith(1);
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
  });

  describe('setup', () => {
    // Token check: hasValidSetupToken/setupEnvFileExists and message variants are covered in
    // setup_files.test.ts and initial_setup_use_case.test.ts. Full "exit with proposal" path
    // is hard to test here because Commander captures options.token default at CLI load time.
    it('calls runLocalAction with INITIAL_SETUP', async () => {
      await program.parseAsync(['node', 'cli', 'setup']);

      expect(runLocalAction).toHaveBeenCalledTimes(1);
      const params = (runLocalAction as jest.Mock).mock.calls[0][0];
      expect(params[INPUT_KEYS.SINGLE_ACTION]).toBe(ACTIONS.INITIAL_SETUP);
      expect(params[INPUT_KEYS.TOKEN]).toBeTruthy();
      expect(params[INPUT_KEYS.WELCOME_TITLE]).toContain('Initial Setup');
    });

    it('exits when not inside a git repo', async () => {
      (execSync as jest.Mock).mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('is-inside-work-tree')) throw new Error('not a repo');
        return Buffer.from('https://github.com/o/r.git');
      });

      await program.parseAsync(['node', 'cli', 'setup']);

      expect(exitSpy).toHaveBeenCalledWith(1);
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

      await program.parseAsync(['node', 'cli', 'setup']);

      expect(logError).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
      const runCalls = (runLocalAction as jest.Mock).mock.calls;
      const ranWithValidRepo = runCalls.length > 0 && runCalls[0][0]?.repo?.owner && runCalls[0][0]?.repo?.repo;
      expect(ranWithValidRepo).not.toBe(true);
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
      expect(exitSpy).toHaveBeenCalledWith(1);
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
      (runLocalAction as jest.Mock).mockRejectedValueOnce(new Error('API error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await program.parseAsync(['node', 'cli', 'detect-potential-problems', '-i', '1']);

      expect(exitSpy).toHaveBeenCalledWith(1);
      const messages = consoleSpy.mock.calls.flat().map(String);
      expect(messages.some((m) => m.includes('Error running detect-potential-problems'))).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('do --output json', () => {
    it('prints JSON when --output json', async () => {
      const { AiRepository } = require('../data/repository/ai_repository');
      AiRepository.mockImplementation(() => ({
        copilotMessage: jest.fn().mockResolvedValue({ text: 'Hi', sessionId: 'sid-1' }),
      }));
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      await program.parseAsync(['node', 'cli', 'do', '-p', 'hello', '--output', 'json']);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"response":'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"sessionId":'));
      logSpy.mockRestore();
    });
  });
});
