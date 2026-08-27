import {
  createPullRequestChangesClient,
  createPullRequestLifecycleClient,
  createPullRequestReviewCommentClient,
  createPullRequestReviewerClient,
} from "../github_pull_request_client_factory";
import {
  OctokitPullRequestChangesClientAdapter,
  OctokitPullRequestLifecycleClientAdapter,
  OctokitPullRequestReviewCommentClientAdapter,
  OctokitPullRequestReviewerClientAdapter,
} from "../../github/octokit_pull_request_adapters";

describe("github pull request client factory", () => {
  it.each([
    [
      "changes",
      createPullRequestChangesClient,
      OctokitPullRequestChangesClientAdapter,
    ],
    [
      "lifecycle",
      createPullRequestLifecycleClient,
      OctokitPullRequestLifecycleClientAdapter,
    ],
    [
      "review comments",
      createPullRequestReviewCommentClient,
      OctokitPullRequestReviewCommentClientAdapter,
    ],
    [
      "reviewers",
      createPullRequestReviewerClient,
      OctokitPullRequestReviewerClientAdapter,
    ],
  ] as const)(
    "binds the %s capability to its dedicated adapter",
    (_name, create, Adapter) => {
      expect(create()).toBeInstanceOf(Adapter);
    },
  );
});
