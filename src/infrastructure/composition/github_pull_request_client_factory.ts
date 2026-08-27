import {
  OctokitPullRequestChangesClientAdapter,
  OctokitPullRequestLifecycleClientAdapter,
  OctokitPullRequestReviewCommentClientAdapter,
  OctokitPullRequestReviewerClientAdapter,
} from "../github/octokit_pull_request_adapters";

export const createPullRequestChangesClient = () =>
  new OctokitPullRequestChangesClientAdapter();
export const createPullRequestLifecycleClient = () =>
  new OctokitPullRequestLifecycleClientAdapter();
export const createPullRequestReviewerClient = () =>
  new OctokitPullRequestReviewerClientAdapter();
export const createPullRequestReviewCommentClient = () =>
  new OctokitPullRequestReviewCommentClientAdapter();
