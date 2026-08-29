const mockIssueContentClient = { kind: 'issue-content-client' };
const mockIssueLabelsClient = { kind: 'issue-labels-client' };
const mockIssueMetadataClient = { kind: 'issue-metadata-client' };
const mockGraphqlTransportClient = { kind: 'graphql-transport-client' };
const mockOrganizationMembersClient = { kind: 'organization-members-client' };
const mockReleaseClient = { kind: 'release-client' };

const mockIssueContentRepository = jest.fn().mockImplementation((client) => ({ kind: 'issue-content-repository', client }));
const mockIssueLabelRepository = jest.fn().mockImplementation((client) => ({ kind: 'issue-label-repository', client }));
const mockIssueMetadataRepository = jest.fn().mockImplementation((client, transport) => ({ kind: 'issue-metadata-repository', client, transport }));
const mockOrganizationMembersRepository = jest.fn().mockImplementation((client) => ({ kind: 'organization-members-repository', client }));
const mockReleaseRepository = jest.fn().mockImplementation((client) => ({ kind: 'release-repository', client }));
const mockIssueUseCase = jest.fn().mockImplementation((...dependencies) => ({ kind: 'issue-use-case', dependencies }));
const mockPullRequestUseCase = jest.fn().mockImplementation((...dependencies) => ({ kind: 'pull-request-use-case', dependencies }));

jest.mock('../github_issue_client_factory', () => ({
  createIssueContentClient: jest.fn(() => mockIssueContentClient),
  createIssueLabelsClient: jest.fn(() => mockIssueLabelsClient),
  createIssueMetadataClient: jest.fn(() => mockIssueMetadataClient),
}));
jest.mock('../github_project_client_factory', () => ({
  createGraphqlTransportClient: jest.fn(() => mockGraphqlTransportClient),
}));
jest.mock('../github_identity_client_factory', () => ({
  createOrganizationMembersClient: jest.fn(() => mockOrganizationMembersClient),
}));
jest.mock('../github_release_client_factory', () => ({
  createReleaseClient: jest.fn(() => mockReleaseClient),
}));
jest.mock('../../../data/repository/issue/issue_content_repository', () => ({
  IssueContentRepository: mockIssueContentRepository,
}));
jest.mock('../../../data/repository/issue/issue_label_repository', () => ({
  IssueLabelRepository: mockIssueLabelRepository,
}));
jest.mock('../../../data/repository/issue/issue_metadata_repository', () => ({
  IssueMetadataRepository: mockIssueMetadataRepository,
}));
jest.mock('../../../data/repository/organization/organization_members_repository', () => ({
  OrganizationMembersRepository: mockOrganizationMembersRepository,
}));
jest.mock('../../../data/repository/release/repository_release_publication_repository', () => ({
  RepositoryReleasePublicationRepository: mockReleaseRepository,
}));
jest.mock('../../../application/usecases/issue_use_case', () => ({ IssueUseCase: mockIssueUseCase }));
jest.mock('../../../application/usecases/pull_request_use_case', () => ({ PullRequestUseCase: mockPullRequestUseCase }));

import { createExecutionIssueSetupCompositionRoot } from '../execution_issue_setup_composition_root';
import { composeIssueUseCase } from '../issue_use_case_composition';
import { createOrganizationMembersCompositionRoot } from '../organization_members_composition_root';
import { composePullRequestUseCase } from '../pull_request_use_case_composition';
import { createRepositoryReleasePort } from '../release_composition_root';

describe('leaf composition roots', () => {
  beforeEach(() => jest.clearAllMocks());

  it('composes the execution issue setup repositories with their clients', () => {
    expect(createExecutionIssueSetupCompositionRoot()).toBeDefined();
    expect(mockIssueMetadataRepository).toHaveBeenCalledWith(mockIssueMetadataClient, mockGraphqlTransportClient);
    expect(mockIssueContentRepository).toHaveBeenCalledWith(mockIssueContentClient);
    expect(mockIssueLabelRepository).toHaveBeenCalledWith(mockIssueLabelsClient);
  });

  it('composes organization members and release ports from their clients', () => {
    expect(createOrganizationMembersCompositionRoot()).toEqual({
      kind: 'organization-members-repository',
      client: mockOrganizationMembersClient,
    });
    expect(createRepositoryReleasePort()).toEqual({
      kind: 'release-repository',
      client: mockReleaseClient,
    });
  });

  it('keeps use-case construction in the composition adapter', () => {
    const issueDependencies = [{ kind: 'issue-dependency' }];
    const pullRequestDependencies = [{ kind: 'pull-request-dependency' }];

    const composeIssue = composeIssueUseCase as unknown as (...dependencies: unknown[]) => unknown;
    const composePullRequest = composePullRequestUseCase as unknown as (...dependencies: unknown[]) => unknown;
    expect(composeIssue(...issueDependencies)).toEqual({ kind: 'issue-use-case', dependencies: issueDependencies });
    expect(composePullRequest(...pullRequestDependencies)).toEqual({ kind: 'pull-request-use-case', dependencies: pullRequestDependencies });
  });
});
