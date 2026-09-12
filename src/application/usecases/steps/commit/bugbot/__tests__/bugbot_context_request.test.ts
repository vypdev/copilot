import type { Execution } from '../../../../../../data/model/execution';
import { projectBugbotContextRequest } from '../bugbot_context_request';

function execution(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'acme',
    repo: 'repo',
    issueNumber: 42,
    isPullRequest: false,
    eventName: 'push',
    pullRequest: { number: -1, head: '' },
    commit: { branch: 'feature/42' },
    tokenUser: undefined,
    inputs: { repository: { id: 7 } },
    ai: {
      getAiIgnoreFiles: () => ['dist/*'],
      getBugbotReviewConfiguration: () => ({ organizationRules: ['org rule'] }),
    },
    ...overrides,
  } as unknown as Execution;
}

describe('Bugbot context request projection', () => {
  it('projects an event PR target without credentials', () => {
    const request = projectBugbotContextRequest(execution({
      isPullRequest: true,
      eventName: 'pull_request',
      pullRequest: { number: 12, head: 'feature/pr' },
      tokenUser: '  bugbot  ',
      inputs: {
        repository: { id: 7 },
        pull_request: {
          head: {
            sha: 'A'.repeat(40),
            repo: { owner: { login: 'fork-owner' } },
          },
        },
      },
    }));

    expect(request).toEqual({
      target: {
        repository: { owner: 'acme', name: 'repo', id: 7 },
        triggerKind: 'pull_request',
        issueNumber: 42,
        headOwner: 'fork-owner',
        headRef: 'feature/pr',
        expectedHeadSha: 'a'.repeat(40),
        eventPullRequestNumber: 12,
        pullRequestRequired: true,
      },
      trustedAuthorLogin: 'bugbot',
      ignorePatterns: ['dist/*'],
      organizationRules: ['org rule'],
    });
    expect(JSON.stringify(request)).not.toContain('token');
  });

  it('applies explicit options and omits invalid optional identities', () => {
    const request = projectBugbotContextRequest(execution({
      owner: 'acme',
      repo: 'repo',
      issueNumber: -1,
      eventName: '',
      commit: { branch: undefined },
      inputs: { repository: { id: 0 } },
    }), {
      branchOverride: '  explicit/head  ',
      issueNumberOverride: 0,
      pullRequestNumberOverride: 0,
      pullRequestRequired: false,
    });

    expect(request.target).toEqual({
      repository: { owner: 'acme', name: 'repo' },
      triggerKind: 'unknown',
      headOwner: 'acme',
      headRef: 'explicit/head',
      pullRequestRequired: false,
    });
    expect(request).not.toHaveProperty('trustedAuthorLogin');
  });

  it('falls back to an empty head when neither PR nor commit supplies one', () => {
    const request = projectBugbotContextRequest(execution({
      issueNumber: 1,
      commit: {},
      inputs: undefined,
    }));

    expect(request.target.headRef).toBe('');
    expect(request.target.headOwner).toBe('acme');
  });
});
