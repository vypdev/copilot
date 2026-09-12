import { ExecutionBranchVersionResolver } from '../../application/usecases/execution/execution_branch_version_resolver';
import { SetupExecutionUseCase } from '../../application/usecases/execution/setup_execution_use_case';
import { GetHotfixVersionUseCase } from '../../application/usecases/steps/common/get_hotfix_version_use_case';
import { GetReleaseTypeUseCase } from '../../application/usecases/steps/common/get_release_type_use_case';
import { GetReleaseVersionUseCase } from '../../application/usecases/steps/common/get_release_version_use_case';
import type { LatestTagQueryPort } from '../../application/ports/branch_tag_ports';
import type {
    SetupConfigurationQueryPort,
    SetupIssueQueryPort,
    SetupOrganizationQueryPort,
} from '../../application/ports/setup_execution_ports';
import { ConfigurationHandler } from '../../manager/description/configuration_handler';
import { createAuthenticatedUserCompositionRoot } from './authenticated_user_composition_root';
import { createExecutionIssueSetupCompositionRoot } from './execution_issue_setup_composition_root';

export interface SetupExecutionCredentials {
    readonly owner: string;
    readonly repository: string;
    readonly token: string;
}

export function createSetupExecutionUseCase(
    latestTagQueryPort: LatestTagQueryPort,
    credentials: SetupExecutionCredentials,
): SetupExecutionUseCase {
    const rawIssueSetupPort = createExecutionIssueSetupCompositionRoot();
    const rawOrganizationSetupPort = createAuthenticatedUserCompositionRoot();
    const configurationHandler = new ConfigurationHandler(rawIssueSetupPort);
    const issueSetupPort: SetupIssueQueryPort = {
        isPullRequest: (issueNumber) => rawIssueSetupPort.isPullRequest(
            credentials.owner, credentials.repository, issueNumber, credentials.token,
        ),
        isIssue: (issueNumber) => rawIssueSetupPort.isIssue(
            credentials.owner, credentials.repository, issueNumber, credentials.token,
        ),
        getHeadBranch: (issueNumber) => rawIssueSetupPort.getHeadBranch(
            credentials.owner, credentials.repository, issueNumber, credentials.token,
        ),
        getLabels: (issueNumber) => rawIssueSetupPort.getLabels(
            credentials.owner, credentials.repository, issueNumber, credentials.token,
        ),
        getDescription: (issueNumber) => rawIssueSetupPort.getDescription(
            credentials.owner, credentials.repository, issueNumber, credentials.token,
        ),
    };
    const organizationSetupPort: SetupOrganizationQueryPort = {
        getTokenUser: () => rawOrganizationSetupPort.getUserFromToken(credentials.token),
    };
    const configurationPort: SetupConfigurationQueryPort = {
        get: (issueNumber) => configurationHandler.get({
            owner: credentials.owner,
            repository: credentials.repository,
            issueNumber,
            token: credentials.token,
        }),
    };
    const releaseVersion = new GetReleaseVersionUseCase(issueSetupPort);
    const releaseType = new GetReleaseTypeUseCase(issueSetupPort);
    const hotfixVersion = new GetHotfixVersionUseCase(issueSetupPort);
    return new SetupExecutionUseCase(
        issueSetupPort,
        organizationSetupPort,
        configurationPort,
        new ExecutionBranchVersionResolver(
            latestTagQueryPort,
            releaseVersion,
            releaseType,
            hotfixVersion,
        ),
    );
}
