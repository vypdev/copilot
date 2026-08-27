const issueSetupPort = { kind: 'issue-setup' };
const organizationSetupPort = { kind: 'organization-setup' };
const configurationPort = { kind: 'configuration' };
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
import { createSetupExecutionUseCase } from '../execution_setup_composition_root';

describe('execution setup composition root', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('composes semantic setup capabilities and shares the issue setup port', () => {
    const latestTagQueryPort = { getLatestTag: jest.fn() } as LatestTagQueryPort;

    const result = createSetupExecutionUseCase(latestTagQueryPort);

    expect(result).toBe(setupExecutionUseCase);
    expect(configurationHandler).toHaveBeenCalledWith(issueSetupPort);
    expect(getReleaseVersionUseCase).toHaveBeenCalledWith(issueSetupPort);
    expect(getReleaseTypeUseCase).toHaveBeenCalledWith(issueSetupPort);
    expect(getHotfixVersionUseCase).toHaveBeenCalledWith(issueSetupPort);
    expect(executionBranchVersionResolver).toHaveBeenCalledWith(
      latestTagQueryPort,
      releaseVersionUseCase,
      releaseTypeUseCase,
      hotfixVersionUseCase,
    );
    expect(setupExecution).toHaveBeenCalledWith(
      issueSetupPort,
      organizationSetupPort,
      configurationPort,
      branchVersionResolver,
    );
    expect(createExecutionIssueSetupCompositionRoot).toHaveBeenCalledTimes(1);
    expect(createAuthenticatedUserCompositionRoot).toHaveBeenCalledTimes(1);
  });
});
