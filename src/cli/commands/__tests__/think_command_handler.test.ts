const mockRunLocalAction = jest.fn();
const mockGetGitInfo = jest.fn();

jest.mock('../../../actions/local_action', () => ({
  runLocalAction: (...args: unknown[]) => mockRunLocalAction(...args),
}));
jest.mock('../../../cli_context', () => ({
  getGitInfo: () => mockGetGitInfo(),
}));
jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { INPUT_KEYS } from '../../../application/contracts/input_keys';
import { ACTIONS } from '../../../data/model/action_types';
import { runThinkCommand } from '../think_command_handler';

describe('runThinkCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGitInfo.mockReturnValue({ owner: 'acme', repo: 'widgets' });
    mockRunLocalAction.mockResolvedValue([]);
    process.exitCode = undefined;
  });

  it('runs an issue-comment-shaped local request without requiring issue #1 to exist', async () => {
    await runThinkCommand({ question: ['explain', 'the locale system'] });

    expect(mockRunLocalAction).toHaveBeenCalledWith(expect.objectContaining({
      [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.THINK,
      eventName: 'issue_comment',
      issue: { number: -1 },
      comment: { body: 'explain the locale system' },
      repo: { owner: 'acme', repo: 'widgets' },
    }));
    expect(mockRunLocalAction.mock.calls[0][0]).not.toHaveProperty(INPUT_KEYS.SINGLE_ACTION_ISSUE);
  });

  it('uses an explicitly configured issue only as optional answer context', async () => {
    await runThinkCommand({ issue: '42', question: 'summarize this issue' });

    expect(mockRunLocalAction).toHaveBeenCalledWith(expect.objectContaining({
      [INPUT_KEYS.SINGLE_ACTION_ISSUE]: 42,
      eventName: 'issue_comment',
      issue: { number: 42 },
      comment: { body: 'summarize this issue' },
    }));
  });

  it('rejects an invalid explicit issue before running the local action', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runThinkCommand({ issue: 'not-an-issue', question: 'explain this' });

      expect(mockRunLocalAction).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      expect(log).toHaveBeenCalledWith('❌ --issue must be a positive integer');
    } finally {
      log.mockRestore();
    }
  });
});
