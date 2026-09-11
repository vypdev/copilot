import type {
  BugbotReviewNavigation,
  BugbotReviewNavigationPort,
} from '../../application/ports/bugbot_review_navigation_ports';

/** Builds trusted GitHub/GitHub Enterprise navigation without leaking env access upstream. */
export class GithubBugbotReviewNavigationAdapter implements BugbotReviewNavigationPort {
  private readonly serverUrl: string;

  constructor(
    serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com',
    private readonly workflowRepository = process.env.GITHUB_REPOSITORY,
    private readonly workflowRunId = process.env.GITHUB_RUN_ID,
  ) {
    this.serverUrl = normalizeHttpsServerUrl(serverUrl);
  }

  forPullRequest(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    headSha: string,
  ): BugbotReviewNavigation {
    if (
      !isGithubPathSegment(owner) ||
      !isGithubPathSegment(repository) ||
      !Number.isSafeInteger(pullRequestNumber) ||
      pullRequestNumber <= 0 ||
      !/^[a-fA-F0-9]{7,64}$/u.test(headSha)
    ) {
      throw new Error('GitHub navigation target is invalid.');
    }
    const repositoryPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    const base = `${this.serverUrl}/${repositoryPath}`;
    const runUrl = this.workflowRepository === `${owner}/${repository}` && /^\d+$/u.test(this.workflowRunId ?? '')
      ? `${base}/actions/runs/${this.workflowRunId}`
      : undefined;
    return {
      pullRequestUrl: `${base}/pull/${pullRequestNumber}`,
      commitUrl: `${base}/commit/${encodeURIComponent(headSha)}`,
      ...(runUrl ? { runUrl } : {}),
    };
  }
}

function isGithubPathSegment(value: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/u.test(value);
}

function normalizeHttpsServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('GitHub server URL must be an absolute HTTPS URL without credentials.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) {
    throw new Error('GitHub server URL must be an absolute HTTPS URL without credentials.');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/u, '');
}
