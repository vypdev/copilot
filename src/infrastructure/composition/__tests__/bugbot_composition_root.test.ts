const issueClient = { kind: "issue-client" };
const lifecycleClient = { kind: "lifecycle-client" };
const changesClient = { kind: "changes-client" };
const reviewCommentClient = { kind: "review-comment-client" };
const secondReviewCommentClient = { kind: "second-review-comment-client" };
const graphqlClient = { kind: "graphql-client" };

const issueContent = { kind: "issue-content" };
const issue = { kind: "issue" };
const lifecycle = { kind: "lifecycle" };
const changes = { kind: "changes" };
const reviewQuery = { kind: "review-query" };
const reviewCommand = { kind: "review-command" };
const threadCommand = { kind: "thread-command" };
const pullRequest = { kind: "pull-request" };

const mockIssueContentRepository = jest.fn(() => issueContent);
const mockBugbotIssueRepository = jest.fn(() => issue);
const mockPullRequestLifecycleRepository = jest.fn(() => lifecycle);
const mockPullRequestChangesRepository = jest.fn(() => changes);
const mockPullRequestReviewCommentQueryRepository = jest.fn(() => reviewQuery);
const mockPullRequestReviewCommentCommandRepository = jest.fn(
  () => reviewCommand,
);
const mockPullRequestReviewThreadRepository = jest.fn(() => threadCommand);
const mockBugbotPullRequestRepository = jest.fn(() => pullRequest);
const mockCreateIssueContentClient = jest.fn(() => issueClient);
const mockCreateGraphqlTransportClient = jest.fn(() => graphqlClient);
const mockCreatePullRequestChangesClient = jest.fn(() => changesClient);
const mockCreatePullRequestLifecycleClient = jest.fn(() => lifecycleClient);
const mockCreatePullRequestReviewCommentClient = jest
  .fn()
  .mockReturnValueOnce(reviewCommentClient)
  .mockReturnValueOnce(secondReviewCommentClient);

jest.mock("../github_issue_client_factory", () => ({
  createIssueContentClient: mockCreateIssueContentClient,
}));

jest.mock("../github_project_client_factory", () => ({
  createGraphqlTransportClient: mockCreateGraphqlTransportClient,
}));

jest.mock("../github_pull_request_client_factory", () => ({
  createPullRequestChangesClient: mockCreatePullRequestChangesClient,
  createPullRequestLifecycleClient: mockCreatePullRequestLifecycleClient,
  createPullRequestReviewCommentClient:
    mockCreatePullRequestReviewCommentClient,
}));

jest.mock("../../../data/repository/issue/issue_content_repository", () => ({
  IssueContentRepository: mockIssueContentRepository,
}));
jest.mock("../../../data/repository/issue/bugbot_issue_repository", () => ({
  BugbotIssueRepository: mockBugbotIssueRepository,
}));
jest.mock(
  "../../../data/repository/pull_request/pull_request_lifecycle_repository",
  () => ({
    PullRequestLifecycleRepository: mockPullRequestLifecycleRepository,
  }),
);
jest.mock(
  "../../../data/repository/pull_request/pull_request_changes_repository",
  () => ({ PullRequestChangesRepository: mockPullRequestChangesRepository }),
);
jest.mock(
  "../../../data/repository/pull_request/pull_request_review_comment_query_repository",
  () => ({
    PullRequestReviewCommentQueryRepository:
      mockPullRequestReviewCommentQueryRepository,
  }),
);
jest.mock(
  "../../../data/repository/pull_request/pull_request_review_comment_command_repository",
  () => ({
    PullRequestReviewCommentCommandRepository:
      mockPullRequestReviewCommentCommandRepository,
  }),
);
jest.mock(
  "../../../data/repository/pull_request/pull_request_review_thread_repository",
  () => ({
    PullRequestReviewThreadRepository: mockPullRequestReviewThreadRepository,
  }),
);
jest.mock(
  "../../../data/repository/pull_request/bugbot_pull_request_repository",
  () => ({ BugbotPullRequestRepository: mockBugbotPullRequestRepository }),
);

import { createBugbotCompositionRoot } from "../bugbot_composition_root";

describe("createBugbotCompositionRoot", () => {
  it("wires review query, command, and thread capabilities explicitly", () => {
    const root = createBugbotCompositionRoot();

    expect(mockCreateIssueContentClient).toHaveBeenCalledTimes(1);
    expect(mockCreateGraphqlTransportClient).toHaveBeenCalledTimes(1);
    expect(mockCreatePullRequestChangesClient).toHaveBeenCalledTimes(1);
    expect(mockCreatePullRequestLifecycleClient).toHaveBeenCalledTimes(1);
    expect(mockCreatePullRequestReviewCommentClient).toHaveBeenCalledTimes(1);
    expect(mockIssueContentRepository).toHaveBeenCalledTimes(1);
    expect(mockBugbotIssueRepository).toHaveBeenCalledTimes(1);
    expect(mockPullRequestLifecycleRepository).toHaveBeenCalledTimes(1);
    expect(mockPullRequestChangesRepository).toHaveBeenCalledTimes(1);
    expect(mockPullRequestReviewCommentQueryRepository).toHaveBeenCalledTimes(
      1,
    );
    expect(mockPullRequestReviewCommentCommandRepository).toHaveBeenCalledTimes(
      1,
    );
    expect(mockPullRequestReviewThreadRepository).toHaveBeenCalledTimes(1);
    expect(mockBugbotPullRequestRepository).toHaveBeenCalledTimes(1);
    expect(mockPullRequestReviewCommentQueryRepository).toHaveBeenCalledWith(
      reviewCommentClient,
    );
    expect(mockPullRequestReviewCommentCommandRepository).toHaveBeenCalledWith(
      reviewCommentClient,
      graphqlClient,
      reviewCommentClient,
    );
    expect(mockPullRequestReviewThreadRepository).toHaveBeenCalledWith(
      graphqlClient,
    );
    expect(mockBugbotPullRequestRepository).toHaveBeenCalledWith(
      lifecycle,
      changes,
      reviewQuery,
      reviewCommand,
      threadCommand,
    );
    expect(root.issue).toBe(issue);
    expect(root.pullRequest).toBe(pullRequest);
    expect(root.context.issue).toBe(root.issue);
    expect(root.context.pullRequest).toBe(root.pullRequest);

    expect(root.resolution.issueComments).toBe(root.issue);
    expect(root.resolution.pullRequestComments).toBe(root.pullRequest);
    expect(root.publication.issueComments).toBe(root.issue);
    expect(root.publication.pullRequestComments).toBe(root.pullRequest);
  });
});
