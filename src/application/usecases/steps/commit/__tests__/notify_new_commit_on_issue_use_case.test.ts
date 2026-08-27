import { NotifyNewCommitOnIssueUseCase } from '../notify_new_commit_on_issue_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

jest.mock('../../../../../utils/list_utils', () => ({
  getRandomElement: jest.fn((arr: string[]) => arr[0]),
}));

const mockAddComment = jest.fn();
const mockOpenIssue = jest.fn();

const mockInvoke = jest.fn();
jest.mock('../../common/execute_script_use_case', () => ({
  CommitPrefixBuilderUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    issueNumber: 42,
    tokens: { token: 't' },
    commit: {
      branch: 'feature/42-add-login',
      commits: [
        {
          id: 'abc',
          message: 'feat: add button',
          author: { name: 'Alice', username: 'alice' },
        },
      ],
    },
    commitPrefixBuilder: '',
    images: {
      commitReleaseGifs: ['url1'],
      commitHotfixGifs: ['url2'],
      commitBugfixGifs: ['url3'],
      commitFeatureGifs: ['url4'],
      commitDocsGifs: ['url5'],
      commitChoreGifs: ['url6'],
      commitAutomaticActions: ['url7'],
    },
    imagesOnCommit: true,
    issue: { reopenOnPush: false },
    release: { active: false },
    hotfix: { active: false },
    isFeature: true,
    isBugfix: false,
    isDocs: false,
    isChore: false,
    ...overrides,
  } as unknown as Parameters<NotifyNewCommitOnIssueUseCase['invoke']>[0];
}

describe('NotifyNewCommitOnIssueUseCase', () => {
  let useCase: NotifyNewCommitOnIssueUseCase;

  beforeEach(() => {
    useCase = new NotifyNewCommitOnIssueUseCase({ openIssue: mockOpenIssue, addComment: mockAddComment });
    mockAddComment.mockResolvedValue(undefined);
    mockOpenIssue.mockResolvedValue(true);
    mockInvoke.mockResolvedValue([
      { payload: { scriptResult: '' } },
    ]);
  });

  it('adds comment with commit info and returns', async () => {
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('Feature News'),
      't'
    );
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('feature/42-add-login'),
      't'
    );
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('alice'),
      't'
    );
    expect(results).toEqual([]);
  });

  it('does not call openIssue when reopenOnPush is false', async () => {
    const param = baseParam({ issue: { reopenOnPush: false } });
    await useCase.invoke(param);
    expect(mockOpenIssue).not.toHaveBeenCalled();
  });

  it('calls openIssue and addComment when reopenOnPush is true', async () => {
    const param = baseParam({ issue: { reopenOnPush: true } });
    await useCase.invoke(param);
    expect(mockOpenIssue).toHaveBeenCalledWith('o', 'r', 42, 't');
    expect(mockAddComment).toHaveBeenCalled();
  });

  it('returns failure on error', async () => {
    mockAddComment.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.success === false)).toBe(true);
    expect(results[0].errors?.length).toBeGreaterThan(0);
  });

  it('calls CommitPrefixBuilderUseCase and uses prefix in message when commitPrefixBuilder is set', async () => {
    mockInvoke.mockResolvedValue([
      { payload: { scriptResult: 'feature-42-add-login' } },
    ]);
    const param = baseParam({
      commitPrefixBuilder: 'replace-slash',
      commitPrefixBuilderParams: undefined,
      commit: {
        branch: 'feature/42-add-login',
        commits: [
          {
            id: 'x',
            message: 'feature-42-add-login: add login screen',
            author: { name: 'A', username: 'a' },
          },
        ],
      },
    });
    await useCase.invoke(param);
    expect(mockInvoke).toHaveBeenCalled();
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('add login screen'),
      't'
    );
  });

  it('uses release title when release.active', async () => {
    const param = baseParam({ release: { active: true }, isFeature: false });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('Release News'),
      't'
    );
  });

  it('uses hotfix title when hotfix.active', async () => {
    const param = baseParam({ hotfix: { active: true }, isFeature: false });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('Hotfix News'),
      't'
    );
  });

  it('uses bugfix and docs titles', async () => {
    const paramBugfix = baseParam({ isBugfix: true, isFeature: false });
    await useCase.invoke(paramBugfix);
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('Bugfix News'),
      't'
    );

    const paramDocs = baseParam({ isDocs: true, isFeature: false });
    await useCase.invoke(paramDocs);
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('Documentation News'),
      't'
    );
  });

  it('uses chore and Automatic News titles', async () => {
    const paramChore = baseParam({ isChore: true, isFeature: false });
    await useCase.invoke(paramChore);
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('Chore News'),
      't'
    );

    const paramAuto = baseParam({
      isFeature: false,
      isBugfix: false,
      isDocs: false,
      isChore: false,
    });
    await useCase.invoke(paramAuto);
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('Automatic News'),
      't'
    );
  });

  it('adds Attention section when commit does not start with prefix and commitPrefix is set', async () => {
    mockInvoke.mockResolvedValue([
      { payload: { scriptResult: 'feature-42' } },
    ]);
    const param = baseParam({
      commitPrefixBuilder: 'replace-slash',
      commit: {
        branch: 'feature/42-add-login',
        commits: [
          {
            id: 'x',
            message: 'wrong prefix: something',
            author: { name: 'A', username: 'a' },
          },
        ],
      },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('Attention'),
      't'
    );
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringMatching(/prefix \*\*feature-42\*\*/),
      't'
    );
  });

  it('when reopenOnPush and openIssue returns true, adds re-opened comment first', async () => {
    mockOpenIssue.mockResolvedValue(true);
    const param = baseParam({ issue: { reopenOnPush: true } });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('re-opened after pushing new commits'),
      't'
    );
  });

  it('when reopenOnPush and openIssue returns false, does not add re-opened comment', async () => {
    mockAddComment.mockClear();
    mockOpenIssue.mockResolvedValue(false);
    const param = baseParam({ issue: { reopenOnPush: true } });
    await useCase.invoke(param);
    const reOpenedCalls = mockAddComment.mock.calls.filter((c) =>
      c[3].includes('re-opened after pushing')
    );
    expect(reOpenedCalls).toHaveLength(0);
  });
});
