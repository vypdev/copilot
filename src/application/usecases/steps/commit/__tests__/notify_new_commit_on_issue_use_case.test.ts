import { NotifyNewCommitOnIssueUseCase } from '../notify_new_commit_on_issue_use_case';
import { projectCommitNotificationContext } from '../../../push_single_action_contexts';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const openIssue = jest.fn();

function context(reopenOnPush: boolean) {
  return projectCommitNotificationContext({
    issueNumber: 42,
    commit: {
      branch: 'feature/42-add-login',
      commits: [{ id: 'abc', message: 'feat: add button', author: { name: 'Alice', username: 'alice' } }],
    },
    commitPrefixBuilder: 'replace-slash',
    images: { imagesOnCommit: true, commitFeatureGifs: ['decorative.gif'] },
    issue: { reopenOnPush },
    release: { active: false },
    hotfix: { active: false },
    isFeature: true,
    isBugfix: false,
    isDocs: false,
    isChore: false,
  } as never);
}

describe('NotifyNewCommitOnIssueUseCase quiet push policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openIssue.mockResolvedValue(true);
  });

  it('creates no comment and performs no state mutation for a routine push', async () => {
    const port = { openIssue };
    const results = await new NotifyNewCommitOnIssueUseCase(port).invoke(context(false));

    expect(results).toEqual([]);
    expect(openIssue).not.toHaveBeenCalled();
    expect(port).not.toHaveProperty('addComment');
  });

  it.each([true, false])('uses only native reopen state when the provider returns %s', async (opened) => {
    openIssue.mockResolvedValue(opened);
    const results = await new NotifyNewCommitOnIssueUseCase({ openIssue }).invoke(context(true));

    expect(results).toEqual([]);
    expect(openIssue).toHaveBeenCalledWith(42);
  });

  it('returns semantic operator evidence when native state synchronization fails', async () => {
    openIssue.mockRejectedValue(new Error('API error'));

    const results = await new NotifyNewCommitOnIssueUseCase({ openIssue }).invoke(context(true));

    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].errors[0]).toMatchObject({ code: 'provider.unavailable' });
  });
});
