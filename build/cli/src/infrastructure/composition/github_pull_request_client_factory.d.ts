import { OctokitPullRequestChangesClientAdapter, OctokitPullRequestLifecycleClientAdapter, OctokitPullRequestReviewCommentClientAdapter, OctokitPullRequestReviewerClientAdapter } from "../github/octokit_pull_request_adapters";
export declare const createPullRequestChangesClient: () => OctokitPullRequestChangesClientAdapter;
export declare const createPullRequestLifecycleClient: () => OctokitPullRequestLifecycleClientAdapter;
export declare const createPullRequestReviewerClient: () => OctokitPullRequestReviewerClientAdapter;
export declare const createPullRequestReviewCommentClient: () => OctokitPullRequestReviewCommentClientAdapter;
