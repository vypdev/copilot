import { projectBugbotContextRequest } from '../bugbot_context_request';
import type { BugbotContextSelectionContext } from '../bugbot_review_operation_context';

function reviewContext(overrides: Record<string, unknown> = {}): BugbotContextSelectionContext {
  return {
    repository: { owner: 'acme', name: 'repo', id: 7 },
    target: {
      issueNumber: 42,
      isPullRequest: false,
      pullRequestNumber: -1,
      headBranch: 'feature/42',
      commitBranch: 'feature/42',
      baseBranch: 'develop',
      pullRequestAction: '',
      draft: false,
    },
    trigger: { kind: 'push', headOwner: 'acme' },
    ignorePatterns: ['dist/*'],
    organizationRules: ['org rule'],
    ...overrides,
  } as BugbotContextSelectionContext;
}

describe('Bugbot context request projection', () => {
  it('projects an event PR target without credentials', () => {
    const request = projectBugbotContextRequest(reviewContext({
      target: {
        ...reviewContext().target,
        isPullRequest: true,
        pullRequestNumber: 12,
        headBranch: 'feature/pr',
      },
      trigger: {
        kind: 'pull_request',
        headOwner: 'fork-owner',
        expectedHeadSha: 'a'.repeat(40),
      },
      trustedAuthorLogin: 'bugbot',
    }));

    expect(request).toEqual({
      target: {
        repository: { owner: 'acme', name: 'repo', id: 7 },
        triggerKind: 'pull_request',
        issueNumber: 42,
        headOwner: 'fork-owner',
        headRef: 'feature/pr',
        expectedHeadSha: 'a'.repeat(40),
        pullRequestSelection: { kind: 'event', number: 12 },
      },
      trustedAuthorLogin: 'bugbot',
      ignorePatterns: ['dist/*'],
      organizationRules: ['org rule'],
    });
    expect(JSON.stringify(request)).not.toContain('token');
  });

  it('keeps a malformed PR target mandatory even when its number is invalid', () => {
    const request = projectBugbotContextRequest(reviewContext({
      target: {
        ...reviewContext().target,
        isPullRequest: true,
        pullRequestNumber: 0,
        headBranch: 'feature/pr',
      },
      trigger: { kind: 'pull_request', headOwner: 'acme' },
    }), { exactHeadPullRequestRequired: false });

    expect(request.target.pullRequestSelection).toEqual({ kind: 'event' });
  });

  it('applies explicit options and omits invalid optional identities', () => {
    const request = projectBugbotContextRequest(reviewContext({
      repository: { owner: 'acme', name: 'repo' },
      target: {
        ...reviewContext().target,
        issueNumber: -1,
        headBranch: '',
        commitBranch: '',
      },
      trigger: { kind: 'unknown', headOwner: 'acme' },
    }), {
      branchOverride: '  explicit/head  ',
      issueNumberOverride: 0,
      pullRequestNumberOverride: 0,
      exactHeadPullRequestRequired: false,
    });

    expect(request.target).toEqual({
      repository: { owner: 'acme', name: 'repo' },
      triggerKind: 'unknown',
      headOwner: 'acme',
      headRef: 'explicit/head',
      pullRequestSelection: { kind: 'exact-head', required: false },
    });
    expect(request).not.toHaveProperty('trustedAuthorLogin');
  });

  it('falls back to an empty head when neither PR nor commit supplies one', () => {
    const request = projectBugbotContextRequest(reviewContext({
      target: {
        ...reviewContext().target,
        issueNumber: 1,
        headBranch: '',
        commitBranch: '',
      },
    }));

    expect(request.target.headRef).toBe('');
    expect(request.target.headOwner).toBe('acme');
  });
});
