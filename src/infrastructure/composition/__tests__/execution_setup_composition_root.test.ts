const issueSetupPort = {
  isPullRequest: jest.fn(),
  isIssue: jest.fn(),
  getHeadBranch: jest.fn(),
  getLabels: jest.fn(),
  getDescription: jest.fn(),
};
const organizationSetupPort = { getUserFromToken: jest.fn() };
const configurationPort = { get: jest.fn() };
const releaseVersionUseCase = { kind: 'release-version' };
const releaseTypeUseCase = { kind: 'release-type' };
const hotfixVersionUseCase = { kind: 'hotfix-version' };
const branchVersionResolver = { kind: 'branch-version-resolver' };
const setupExecutionUseCase = { kind: 'setup-execution' };

const createExecutionIssueSetupCompositionRoot = jest.fn(() => issueSetupPort);
const createAuthenticatedUserCompositionRoot = jest.fn(() => organizationSetupPort);
const configurationHandler = jest.fn(() => configurationPort);
const getReleaseVersionUseCase = jest.fn(() => releaseVersionUseCase);
const getReleaseTypeUseCase = jest.fn(() => releaseTypeUseCase);
const getHotfixVersionUseCase = jest.fn(() => hotfixVersionUseCase);
const executionBranchVersionResolver = jest.fn(() => branchVersionResolver);
const setupExecution = jest.fn(() => setupExecutionUseCase);

jest.mock('../execution_issue_setup_composition_root', () => ({
  createExecutionIssueSetupCompositionRoot,
}));
jest.mock('../authenticated_user_composition_root', () => ({
  createAuthenticatedUserCompositionRoot,
}));
jest.mock('../../../manager/description/configuration_handler', () => ({
  ConfigurationHandler: configurationHandler,
}));
jest.mock('../../../application/usecases/steps/common/get_release_version_use_case', () => ({
  GetReleaseVersionUseCase: getReleaseVersionUseCase,
}));
jest.mock('../../../application/usecases/steps/common/get_release_type_use_case', () => ({
  GetReleaseTypeUseCase: getReleaseTypeUseCase,
}));
jest.mock('../../../application/usecases/steps/common/get_hotfix_version_use_case', () => ({
  GetHotfixVersionUseCase: getHotfixVersionUseCase,
}));
jest.mock('../../../application/usecases/execution/execution_branch_version_resolver', () => ({
  ExecutionBranchVersionResolver: executionBranchVersionResolver,
}));
jest.mock('../../../application/usecases/execution/setup_execution_use_case', () => ({
  SetupExecutionUseCase: setupExecution,
}));

import type { LatestTagQueryPort } from '../../../application/ports/branch_tag_ports';
import type {
  SetupConfigurationQueryPort,
  SetupIssueQueryPort,
  SetupOrganizationQueryPort,
} from '../../../application/ports/setup_execution_ports';
import { createSetupExecutionUseCase } from '../execution_setup_composition_root';

describe('execution setup composition root', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('binds credentials once and exposes only semantic setup operations', async () => {
    const latestTagQueryPort = { getLatestTag: jest.fn() } as LatestTagQueryPort;
    const credentials = { owner: 'owner', repository: 'repository', token: 'secret-token' };

    const result = createSetupExecutionUseCase(latestTagQueryPort, credentials);

    expect(result).toBe(setupExecutionUseCase);
    expect(configurationHandler).toHaveBeenCalledWith(issueSetupPort);
    const semanticIssuePort = (getReleaseVersionUseCase.mock.calls as unknown[][])[0][0] as SetupIssueQueryPort;
    expect(getReleaseTypeUseCase).toHaveBeenCalledWith(semanticIssuePort);
    expect(getHotfixVersionUseCase).toHaveBeenCalledWith(semanticIssuePort);
    expect(executionBranchVersionResolver).toHaveBeenCalledWith(
      latestTagQueryPort,
      releaseVersionUseCase,
      releaseTypeUseCase,
      hotfixVersionUseCase,
    );
    const [, semanticOrganizationPort, semanticConfigurationPort, resolver] = (
      setupExecution.mock.calls as unknown[][]
    )[0] as [SetupIssueQueryPort, SetupOrganizationQueryPort, SetupConfigurationQueryPort, unknown];
    expect(setupExecution).toHaveBeenCalledWith(
      semanticIssuePort,
      semanticOrganizationPort,
      semanticConfigurationPort,
      branchVersionResolver,
    );
    expect(resolver).toBe(branchVersionResolver);
    expect(createExecutionIssueSetupCompositionRoot).toHaveBeenCalledTimes(1);
    expect(createAuthenticatedUserCompositionRoot).toHaveBeenCalledTimes(1);

    await semanticIssuePort.isPullRequest(42);
    await semanticIssuePort.isIssue(42);
    await semanticIssuePort.getHeadBranch(42);
    await semanticIssuePort.getLabels(42);
    await semanticIssuePort.getDescription(42);
    await semanticOrganizationPort.getTokenUser();
    await semanticConfigurationPort.get(42);

    expect(issueSetupPort.isPullRequest).toHaveBeenCalledWith('owner', 'repository', 42, 'secret-token');
    expect(issueSetupPort.isIssue).toHaveBeenCalledWith('owner', 'repository', 42, 'secret-token');
    expect(issueSetupPort.getHeadBranch).toHaveBeenCalledWith('owner', 'repository', 42, 'secret-token');
    expect(issueSetupPort.getLabels).toHaveBeenCalledWith('owner', 'repository', 42, 'secret-token');
    expect(issueSetupPort.getDescription).toHaveBeenCalledWith('owner', 'repository', 42, 'secret-token');
    expect(organizationSetupPort.getUserFromToken).toHaveBeenCalledWith('secret-token');
    expect(configurationPort.get).toHaveBeenCalledWith({
      owner: 'owner',
      repository: 'repository',
      issueNumber: 42,
      token: 'secret-token',
    });
  });
});
