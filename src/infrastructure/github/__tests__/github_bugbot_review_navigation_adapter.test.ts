import { GithubBugbotReviewNavigationAdapter } from '../github_bugbot_review_navigation_adapter';

describe('GithubBugbotReviewNavigationAdapter', () => {
  it('builds GitHub Enterprise links and includes the matching workflow run', () => {
    const adapter = new GithubBugbotReviewNavigationAdapter(
      'https://github.example.com/',
      'org/repo',
      '12345',
    );
    expect(adapter.forPullRequest('org', 'repo', 17, 'a'.repeat(40))).toEqual({
      pullRequestUrl: 'https://github.example.com/org/repo/pull/17',
      commitUrl: `https://github.example.com/org/repo/commit/${'a'.repeat(40)}`,
      runUrl: 'https://github.example.com/org/repo/actions/runs/12345',
    });
  });

  it('omits unrelated or invalid workflow runs', () => {
    const adapter = new GithubBugbotReviewNavigationAdapter(
      'https://github.com',
      'different/repository',
      'not-a-run',
    );
    expect(adapter.forPullRequest('org-name', 'repo.name', 9, 'b'.repeat(40))).toEqual({
      pullRequestUrl: 'https://github.com/org-name/repo.name/pull/9',
      commitUrl: `https://github.com/org-name/repo.name/commit/${'b'.repeat(40)}`,
    });
  });

  it.each([
    ['org/name', 'repo', 1, 'a'.repeat(40)],
    ['org', '', 1, 'a'.repeat(40)],
    ['org', 'repo', 0, 'a'.repeat(40)],
    ['org', 'repo', 1, 'not-a-sha'],
  ] as const)('rejects an invalid navigation target %#', (owner, repository, pr, sha) => {
    const adapter = new GithubBugbotReviewNavigationAdapter('https://github.com');
    expect(() => adapter.forPullRequest(owner, repository, pr, sha)).toThrow(
      'GitHub navigation target is invalid.',
    );
  });

  it.each([
    'http://github.example.com',
    'https://user:secret@github.example.com',
    'not-a-url',
  ])('rejects unsafe server URL %s', (serverUrl) => {
    expect(() => new GithubBugbotReviewNavigationAdapter(serverUrl)).toThrow(
      'GitHub server URL must be an absolute HTTPS URL without credentials.',
    );
  });
});
