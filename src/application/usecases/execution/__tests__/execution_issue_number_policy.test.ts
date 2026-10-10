import type { SetupExecutionContext } from '../setup_execution_contracts';
import { resolveExecutionIssueNumber } from '../resolve_execution_issue_number';
import {
  resolveEventIssueNumber,
  resolveSingleActionIssueNumber,
} from '../execution_issue_number_policy';

const issueRepository = {
  isPullRequest: jest.fn(),
  isIssue: jest.fn(),
  getHeadBranch: jest.fn(),
};

describe('live PR conversation issue resolution', () => {
  it.each(['issue_comment', 'pull_request_review_comment'])('loads the linked issue from the real head for %s', async eventName => {
    issueRepository.getHeadBranch.mockResolvedValueOnce('docs/44-work');
    const result = await resolveExecutionIssueNumber(context({
      eventName, isPullRequest: true, pullRequest: { number: 91, head: '', base: '' },
    }), issueRepository);
    expect(result.issueNumber).toBe(44);
    expect(issueRepository.getHeadBranch).toHaveBeenLastCalledWith(91);
  });

  it('keeps an unlinked PR separate from an issue with the same number', async () => {
    issueRepository.getHeadBranch.mockResolvedValueOnce('codex/pr-ux');
    const result = await resolveExecutionIssueNumber(context({
      eventName: 'issue_comment', isPullRequest: true, pullRequest: { number: 91, head: '', base: '' },
    }), issueRepository);
    expect(result.issueNumber).toBeUndefined();
  });

  it('does not infer branch authority when the live PR head is unavailable', async () => {
    issueRepository.getHeadBranch.mockResolvedValueOnce(undefined);
    const result = await resolveExecutionIssueNumber(context({
      eventName: 'issue_comment', isPullRequest: true, pullRequest: { number: 91, head: '', base: '' },
    }), issueRepository);
    expect(result.issueNumber).toBeUndefined();
    expect(result).not.toHaveProperty('pullRequestHeadBranch');
  });
});

function context(overrides: Partial<SetupExecutionContext> = {}): SetupExecutionContext {
  return {
    debug: false,
    local: false,
    issueNumber: -1,
    eventName: '',
    isSingleAction: false,
    isIssue: false,
    isPullRequest: false,
    isPush: false,
    issue: { number: -1 },
    pullRequest: { number: -1, head: '', base: '' },
    commit: { branch: '' },
    singleAction: { issue: -1, currentAction: '', isIssue: false, isPullRequest: false, isPush: false },
    branches: {
      featureTree: 'feature',
      bugfixTree: 'bugfix',
      hotfixTree: 'hotfix',
      releaseTree: 'release',
      docsTree: 'docs',
      choreTree: 'chore',
    },
    labelNames: {
      feature: 'feature',
      enhancement: 'enhancement',
      bugfix: 'bugfix',
      bug: 'bug',
      hotfix: 'hotfix',
      release: 'release',
      docs: 'docs',
      documentation: 'documentation',
      chore: 'chore',
      maintenance: 'maintenance',
    },
    currentPullRequestLabels: [],
    release: { active: false },
    hotfix: { active: false },
    ...overrides,
  };
}

describe('execution issue number policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    { configuredSingleActionIssue: 1 },
    { isIssue: true, issue: { number: 1 } },
    { isPullRequest: true, pullRequest: { number: 7, head: 'feature/1-work', base: 'develop' } },
    { isPush: true, commit: { branch: 'feature/1-work' } },
  ])('keeps repository installation independent of supplied issue context %j', async overrides => {
    const result = await resolveSingleActionIssueNumber(context({ ...overrides, isSingleAction: true,
      singleAction: { issue: 1, currentAction: 'initial_setup', isIssue: true, isPullRequest: true, isPush: true },
    }), issueRepository);
    expect(result).toEqual({ singleAction: { issue: 0, isIssue: false, isPullRequest: false, isPush: false } });
    expect(issueRepository.isIssue).not.toHaveBeenCalled();
    expect(issueRepository.isPullRequest).not.toHaveBeenCalled();
    expect(issueRepository.getHeadBranch).not.toHaveBeenCalled();
  });

  it('uses the explicit pull-request number for check-suite events', () => {
    const result = resolveEventIssueNumber(context({
      eventName: 'check_suite',
      isPullRequest: true,
      pullRequest: { number: 91, head: 'feature/44-work', base: 'develop' },
    }));

    expect(result.issueNumber).toBe(91);
  });

  it('does not treat an ordinary pull request as its own linked issue', () => {
    expect(resolveEventIssueNumber(context({
      eventName: 'pull_request',
      isPullRequest: true,
      pullRequest: { number: 91, head: 'codex/pr-ux', base: 'develop' },
    })).issueNumber).toBeUndefined();

    expect(resolveEventIssueNumber(context({
      eventName: 'pull_request',
      isPullRequest: true,
      pullRequest: { number: 91, head: 'feature/91-self-reference', base: 'develop' },
    })).issueNumber).toBeUndefined();
  });

  it('does not treat a pull-request review-state event as its own linked issue', () => {
    expect(resolveEventIssueNumber(context({
      eventName: 'pull_request_review',
      isPullRequest: true,
      pullRequest: { number: 91, head: 'codex/pr-ux', base: 'develop' },
    })).issueNumber).toBeUndefined();

    expect(resolveEventIssueNumber(context({
      eventName: 'pull_request_review',
      isPullRequest: true,
      pullRequest: { number: 91, head: 'feature/42-work', base: 'develop' },
    })).issueNumber).toBe(42);
  });

  it('keeps a distinct branch issue as the ordinary pull-request linkage target', () => {
    expect(resolveEventIssueNumber(context({
      eventName: 'pull_request',
      isPullRequest: true,
      pullRequest: { number: 91, head: 'feature/42-work', base: 'develop' },
    })).issueNumber).toBe(42);
  });

  it('returns unresolved without provider calls for an invalid configured target', async () => {
    const result = await resolveSingleActionIssueNumber(
      context({ isSingleAction: true, singleAction: {
        issue: -1,
        currentAction: 'check_progress',
        isIssue: false,
        isPullRequest: false,
        isPush: false,
      } }),
      issueRepository,
    );

    expect(result.issueNumber).toBeUndefined();
    expect(issueRepository.isPullRequest).not.toHaveBeenCalled();
  });

  it('preserves provider classification when a target is neither an issue nor a pull request', async () => {
    issueRepository.isPullRequest.mockResolvedValue(false);
    issueRepository.isIssue.mockResolvedValue(false);

    const result = await resolveSingleActionIssueNumber(
      context({ isSingleAction: true, singleAction: {
        issue: 77,
        currentAction: 'check_progress',
        isIssue: false,
        isPullRequest: false,
        isPush: false,
      } }),
      issueRepository,
    );

    expect(result).toEqual({
      issueNumber: undefined,
      singleAction: { issue: 77, isIssue: false, isPullRequest: false, isPush: false },
    });
    expect(issueRepository.isPullRequest.mock.invocationCallOrder[0])
      .toBeLessThan(issueRepository.isIssue.mock.invocationCallOrder[0]);
  });
});
