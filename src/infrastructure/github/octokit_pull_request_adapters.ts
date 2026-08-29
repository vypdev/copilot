import type {
  GithubPullRequestChangesClient,
  GithubPullRequestLifecycleClient,
} from "./ports/github_pull_request_provider_ports";
import { getOctokitClient } from "./octokit_client_resolver";
import type { GithubClientPort } from "./ports/github_client_provider_port";
import type {
  GithubPullRequestReviewCommentClient,
  GithubPullRequestReviewerClient,
} from "./ports/github_pull_request_review_protocol";

export class OctokitPullRequestChangesClientAdapter implements GithubClientPort<GithubPullRequestChangesClient> {
  getClient(token: string): GithubPullRequestChangesClient {
    return getOctokitClient<GithubPullRequestChangesClient>(token);
  }
}

export class OctokitPullRequestLifecycleClientAdapter implements GithubClientPort<GithubPullRequestLifecycleClient> {
  getClient(token: string): GithubPullRequestLifecycleClient {
    return getOctokitClient<GithubPullRequestLifecycleClient>(token);
  }
}

export class OctokitPullRequestReviewerClientAdapter implements GithubClientPort<GithubPullRequestReviewerClient> {
  getClient(token: string): GithubPullRequestReviewerClient {
    return getOctokitClient<GithubPullRequestReviewerClient>(token);
  }
}

export class OctokitPullRequestReviewCommentClientAdapter implements GithubClientPort<GithubPullRequestReviewCommentClient> {
  getClient(token: string): GithubPullRequestReviewCommentClient {
    return getOctokitClient<GithubPullRequestReviewCommentClient>(token);
  }
}
