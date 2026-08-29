const mockIssueLifecycleClient = { kind: "issue-lifecycle-client" };
const mockIssueContentClient = { kind: "issue-content-client" };
const mockIssueMetadataClient = { kind: "issue-metadata-client" };
const mockIssueTitleClient = { kind: "issue-title-client" };
const mockIssueAssignmentClient = { kind: "issue-assignment-client" };
const mockIssueLabelsClient = { kind: "issue-labels-client" };
const mockPullRequestLifecycleClient = {
  kind: "pull-request-lifecycle-client",
};
const secondPullRequestLifecycleClient = {
  kind: "second-pull-request-lifecycle-client",
};
const mockGraphqlClient = { kind: "graphql-client" };

const mockIssueLifecycle = { kind: "issue-lifecycle" };
const mockIssueContent = { kind: "issue-content" };
const mockPullRequestLifecycle = { kind: "pull-request-lifecycle" };
const secondPullRequestLifecycle = { kind: "second-pull-request-lifecycle" };
const mockIssueMetadata = { kind: "issue-metadata" };
const mockIssueTitle = { kind: "issue-title" };
const mockIssueClosure = { kind: "issue-closure" };
const mockIssueAssignment = { kind: "issue-assignment" };
const mockIssueLabels = { kind: "issue-labels" };
const mockOrganizationMembers = { kind: "organization-members" };
const mockReviewer = { kind: "reviewer" };
const mockProjectBoard = {
  command: { kind: "project-command" },
  link: { kind: "project-link" },
};
const mockFindingsQuery = { kind: "findings-query" };
const mockDescriptionUseCase = { kind: "description-use-case" };
const mockComposedUseCase = { kind: "pull-request-use-case" };

const mockComposePullRequestUseCase = jest.fn(
  (..._arguments: unknown[]) => mockComposedUseCase,
);
const mockUpdatePullRequestDescriptionUseCase = jest.fn(
  () => mockDescriptionUseCase,
);
const mockCreatePullRequestReviewerCompositionRoot = jest.fn(
  () => mockReviewer,
);
const mockCreateGraphqlTransportClient = jest.fn(() => mockGraphqlClient);
const mockCreatePullRequestLifecycleClient = jest
  .fn()
  .mockReturnValueOnce(mockPullRequestLifecycleClient)
  .mockReturnValueOnce(secondPullRequestLifecycleClient);
const mockCreateFindingsQueryPort = jest.fn(() => mockFindingsQuery);
const mockCreateOrganizationMembersCompositionRoot = jest.fn(
  () => mockOrganizationMembers,
);
const mockCreateProjectBoardCompositionRoot = jest.fn(() => mockProjectBoard);
const mockPullRequestLifecycleRepository = jest
  .fn()
  .mockReturnValueOnce(mockPullRequestLifecycle)
  .mockReturnValueOnce(secondPullRequestLifecycle);

jest.mock("../github_issue_client_factory", () => ({
  createIssueAssignmentClient: jest.fn(() => mockIssueAssignmentClient),
  createIssueContentClient: jest.fn(() => mockIssueContentClient),
  createIssueLabelsClient: jest.fn(() => mockIssueLabelsClient),
  createIssueLifecycleClient: jest.fn(() => mockIssueLifecycleClient),
  createIssueMetadataClient: jest.fn(() => mockIssueMetadataClient),
  createIssueTitleClient: jest.fn(() => mockIssueTitleClient),
}));

jest.mock("../github_project_client_factory", () => ({
  createGraphqlTransportClient: mockCreateGraphqlTransportClient,
}));

jest.mock("../github_pull_request_client_factory", () => ({
  createPullRequestLifecycleClient: mockCreatePullRequestLifecycleClient,
}));

jest.mock("../agent_capability_composition_root", () => ({
  createFindingsQueryPort: mockCreateFindingsQueryPort,
}));

jest.mock("../organization_members_composition_root", () => ({
  createOrganizationMembersCompositionRoot:
    mockCreateOrganizationMembersCompositionRoot,
}));

jest.mock("../project_board_composition_root", () => ({
  createProjectBoardCompositionRoot: mockCreateProjectBoardCompositionRoot,
}));

jest.mock("../pull_request_reviewer_composition_root", () => ({
  createPullRequestReviewerCompositionRoot:
    mockCreatePullRequestReviewerCompositionRoot,
}));

jest.mock("../pull_request_use_case_composition", () => ({
  composePullRequestUseCase: mockComposePullRequestUseCase,
}));

jest.mock(
  "../../../application/usecases/steps/pull_request/update_pull_request_description_use_case",
  () => ({
    UpdatePullRequestDescriptionUseCase:
      mockUpdatePullRequestDescriptionUseCase,
  }),
);

jest.mock("../../../data/repository/issue/issue_lifecycle_repository", () => ({
  IssueLifecycleRepository: jest.fn(() => mockIssueLifecycle),
}));

jest.mock("../../../data/repository/issue/issue_content_repository", () => ({
  IssueContentRepository: jest.fn(() => mockIssueContent),
}));

jest.mock(
  "../../../data/repository/pull_request/pull_request_lifecycle_repository",
  () => ({
    PullRequestLifecycleRepository: mockPullRequestLifecycleRepository,
  }),
);

jest.mock("../../../data/repository/issue/issue_metadata_repository", () => ({
  IssueMetadataRepository: jest.fn(() => mockIssueMetadata),
}));

jest.mock("../../../data/repository/issue/issue_title_repository", () => ({
  IssueTitleRepository: jest.fn(() => mockIssueTitle),
}));

jest.mock("../../../data/repository/issue/issue_closure_repository", () => ({
  IssueClosureRepository: jest.fn(() => mockIssueClosure),
}));

jest.mock("../../../data/repository/issue/issue_assignment_repository", () => ({
  IssueAssignmentRepository: jest.fn(() => mockIssueAssignment),
}));

jest.mock("../../../data/repository/issue/issue_label_repository", () => ({
  IssueLabelRepository: jest.fn(() => mockIssueLabels),
}));

import { createPullRequestUseCaseCompositionRoot } from "../pull_request_use_case_composition_root";

describe("createPullRequestUseCaseCompositionRoot", () => {
  it("binds the dedicated reviewer capability and preserves shared lifecycle identity", () => {
    const root = createPullRequestUseCaseCompositionRoot();

    expect(mockCreatePullRequestLifecycleClient).toHaveBeenCalledTimes(1);
    expect(mockPullRequestLifecycleRepository).toHaveBeenCalledTimes(1);
    expect(mockCreateGraphqlTransportClient).toHaveBeenCalledTimes(1);
    expect(mockCreateOrganizationMembersCompositionRoot).toHaveBeenCalledTimes(
      1,
    );
    expect(mockCreateProjectBoardCompositionRoot).toHaveBeenCalledTimes(1);
    expect(mockCreateFindingsQueryPort).toHaveBeenCalledTimes(1);
    expect(mockCreatePullRequestReviewerCompositionRoot).toHaveBeenCalledTimes(
      1,
    );
    expect(mockUpdatePullRequestDescriptionUseCase).toHaveBeenCalledTimes(1);
    expect(mockUpdatePullRequestDescriptionUseCase).toHaveBeenCalledWith(
      mockPullRequestLifecycle,
      mockIssueContent,
      mockOrganizationMembers,
      mockFindingsQuery,
    );
    expect(mockComposePullRequestUseCase).toHaveBeenCalledTimes(1);
    const argumentsPassed = mockComposePullRequestUseCase.mock.calls[0];
    expect(argumentsPassed[0]).toBe(mockDescriptionUseCase);
    expect(argumentsPassed).toHaveLength(2);
    expect(argumentsPassed[1]).toEqual(expect.objectContaining({
      updateTitle: expect.objectContaining({ invoke: expect.any(Function) }),
      assignReviewersToIssue: expect.objectContaining({ invoke: expect.any(Function) }),
      linkPullRequestProject: expect.objectContaining({ invoke: expect.any(Function) }),
      linkPullRequestIssue: expect.objectContaining({ invoke: expect.any(Function) }),
      closeIssueAfterMerging: expect.objectContaining({ invoke: expect.any(Function) }),
    }));
    expect(root).toBe(mockComposedUseCase);
  });
});
