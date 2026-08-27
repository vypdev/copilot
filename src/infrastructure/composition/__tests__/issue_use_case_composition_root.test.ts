const createBranchClient = jest.fn(() => ({ kind: "branch-client" }));
const createGraphqlTransportClient = jest.fn(() => ({
  kind: "graphql-client",
}));
const createIssueAssignmentClient = jest.fn(() => ({
  kind: "issue-assignment-client",
}));
const createIssueContentClient = jest.fn(() => ({
  kind: "issue-content-client",
}));
const createIssueLifecycleClient = jest.fn(() => ({
  kind: "issue-lifecycle-client",
}));
const createIssueMetadataClient = jest.fn(() => ({
  kind: "issue-metadata-client",
}));
const createIssueTitleClient = jest.fn(() => ({ kind: "issue-title-client" }));
const createWorkflowDispatchClient = jest.fn(() => ({
  kind: "workflow-client",
}));

jest.mock("../github_branch_client_factory", () => ({ createBranchClient }));
jest.mock("../github_project_client_factory", () => ({
  createGraphqlTransportClient,
}));
jest.mock("../github_issue_client_factory", () => ({
  createIssueAssignmentClient,
  createIssueContentClient,
  createIssueLifecycleClient,
  createIssueMetadataClient,
  createIssueTitleClient,
}));
jest.mock("../github_workflow_client_factory", () => ({
  createWorkflowDispatchClient,
}));

const projectBoard = {
  query: { kind: "project-query" },
  link: { kind: "project-link" },
  command: { kind: "project-command" },
};
const organizationMembers = { kind: "organization-members" };
const findingsQuery = { kind: "findings-query" };

jest.mock("../project_board_composition_root", () => ({
  createProjectBoardCompositionRoot: jest.fn(() => projectBoard),
}));
jest.mock("../organization_members_composition_root", () => ({
  createOrganizationMembersCompositionRoot: jest.fn(() => organizationMembers),
}));
jest.mock("../agent_capability_composition_root", () => ({
  createFindingsQueryPort: jest.fn(() => findingsQuery),
}));

const branchLifecycle = { kind: "branch-lifecycle" };
const branchName = { kind: "branch-name" };
const gitCli = { kind: "git-cli" };
const linkedBranch = { kind: "linked-branch" };
const branchDelay = { kind: "branch-delay" };

jest.mock("../../../data/repository/branch_lifecycle_repository", () => ({
  BranchLifecycleRepository: jest
    .fn()
    .mockImplementation(() => branchLifecycle),
}));
jest.mock("../../../data/repository/branch_name_repository", () => ({
  BranchNameRepository: jest.fn().mockImplementation(() => branchName),
}));
jest.mock("../../../data/repository/git_cli_repository", () => ({
  GitCliRepository: jest.fn().mockImplementation(() => gitCli),
}));
jest.mock("../../../data/repository/branch/linked_branch_repository", () => ({
  LinkedBranchRepository: jest.fn().mockImplementation(() => linkedBranch),
}));
jest.mock("../../time/timer_branch_propagation_delay_adapter", () => ({
  TimerBranchPropagationDelayAdapter: jest
    .fn()
    .mockImplementation(() => branchDelay),
}));

const composedIssueUseCase = { kind: "issue-use-case" };
const composeIssueUseCase = jest.fn(
  (..._dependencies: unknown[]) => composedIssueUseCase,
);

jest.mock("../issue_use_case_composition", () => ({ composeIssueUseCase }));

import { createIssueUseCaseCompositionRoot } from "../issue_use_case_composition_root";

describe("issue use case composition root", () => {
  beforeEach(() => jest.clearAllMocks());

  it("binds branch capabilities independently without a preparation aggregate", () => {
    const result = createIssueUseCaseCompositionRoot();
    const dependencies = composeIssueUseCase.mock.calls[0];

    expect(result).toBe(composedIssueUseCase);
    expect(dependencies[11]).toBe(branchLifecycle);
    expect(dependencies[12]).toBe(branchName);
    expect(dependencies[13]).toBe(gitCli);
    expect(dependencies[14]).toBe(gitCli);
    expect(dependencies[15]).toBe(linkedBranch);
    expect(dependencies[16]).toBe(branchDelay);
    expect(createBranchClient).toHaveBeenCalledTimes(1);
  });
});
