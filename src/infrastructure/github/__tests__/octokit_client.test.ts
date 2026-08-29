import * as github from "@actions/github";
import {
  OctokitBranchClientAdapter,
  OctokitBranchComparisonClientAdapter,
  OctokitBranchMergeClientAdapter,
} from "../octokit_branch_adapters";
import { OctokitGraphqlTransportClientAdapter } from "../octokit_project_adapters";
import {
  OctokitIssueAssignmentClientAdapter,
  OctokitIssueContentClientAdapter,
  OctokitIssueLabelProvisioningClientAdapter,
  OctokitIssueLabelsClientAdapter,
  OctokitIssueLifecycleClientAdapter,
  OctokitIssueMetadataClientAdapter,
  OctokitIssueTitleClientAdapter,
} from "../octokit_issue_adapters";
import {
  OctokitAuthenticatedUserClientAdapter,
  OctokitActorAuthorizationClientAdapter,
  OctokitOrganizationMembersClientAdapter,
  OctokitRepositoryContextClientAdapter,
  OctokitOwnerTypeClientAdapter,
} from "../octokit_identity_adapters";
import {
  OctokitPullRequestChangesClientAdapter,
  OctokitPullRequestLifecycleClientAdapter,
  OctokitPullRequestReviewCommentClientAdapter,
  OctokitPullRequestReviewerClientAdapter,
} from "../octokit_pull_request_adapters";
import { OctokitReleaseClientAdapter } from "../octokit_release_adapters";
import {
  OctokitWorkflowDispatchClientAdapter,
  OctokitWorkflowRunsClientAdapter,
} from "../octokit_workflow_adapters";

jest.mock("@actions/github", () => ({
  getOctokit: jest.fn(),
  context: { repo: { owner: "test-owner", repo: "test-repo" } },
}));

type Adapter = { getClient(token: string): unknown };

describe("Octokit client adapters contract", () => {
  const adapters: Array<[string, new () => Adapter]> = [
    ["branch", OctokitBranchClientAdapter],
    ["branch comparison", OctokitBranchComparisonClientAdapter],
    ["branch merge", OctokitBranchMergeClientAdapter],
    ["GraphQL", OctokitGraphqlTransportClientAdapter],
    ["issue assignment", OctokitIssueAssignmentClientAdapter],
    ["issue content", OctokitIssueContentClientAdapter],
    ["issue label provisioning", OctokitIssueLabelProvisioningClientAdapter],
    ["issue labels", OctokitIssueLabelsClientAdapter],
    ["issue lifecycle", OctokitIssueLifecycleClientAdapter],
    ["issue metadata", OctokitIssueMetadataClientAdapter],
    ["issue title", OctokitIssueTitleClientAdapter],
    ["authenticated user", OctokitAuthenticatedUserClientAdapter],
    ["actor authorization", OctokitActorAuthorizationClientAdapter],
    ["organization members", OctokitOrganizationMembersClientAdapter],
    ["owner type", OctokitOwnerTypeClientAdapter],
    ["pull request changes", OctokitPullRequestChangesClientAdapter],
    ["pull request lifecycle", OctokitPullRequestLifecycleClientAdapter],
    [
      "pull request review comments",
      OctokitPullRequestReviewCommentClientAdapter,
    ],
    ["pull request reviewers", OctokitPullRequestReviewerClientAdapter],
    ["release", OctokitReleaseClientAdapter],
    ["workflow runs", OctokitWorkflowRunsClientAdapter],
    ["workflow dispatch", OctokitWorkflowDispatchClientAdapter],
  ];

  beforeEach(() => jest.clearAllMocks());

  it.each(adapters)(
    "%s forwards the token and preserves the provider client",
    (_name, AdapterClass) => {
      const providerClient = { rest: {} };
      jest
        .mocked(github.getOctokit)
        .mockReturnValue(
          providerClient as ReturnType<typeof github.getOctokit>,
        );

      const result = new AdapterClass().getClient("token-under-test");

      expect(github.getOctokit).toHaveBeenCalledWith("token-under-test");
      expect(result).toBe(providerClient);
    },
  );

  it("exposes the GitHub Actions repository context independently of the Octokit client", () => {
    const result = new OctokitRepositoryContextClientAdapter().getClient(
      "token-under-test",
    );

    expect(result).toEqual({ context: github.context });
    expect(github.getOctokit).not.toHaveBeenCalled();
  });
});
