import { ExecutionBranchVersionResolver } from '../../application/usecases/execution/execution_branch_version_resolver';
import { SetupExecutionUseCase } from '../../application/usecases/execution/setup_execution_use_case';
import { GetHotfixVersionUseCase } from '../../application/usecases/steps/common/get_hotfix_version_use_case';
import { GetReleaseTypeUseCase } from '../../application/usecases/steps/common/get_release_type_use_case';
import { GetReleaseVersionUseCase } from '../../application/usecases/steps/common/get_release_version_use_case';
import type { LatestTagQueryPort } from '../../application/ports/branch_tag_ports';
import { ConfigurationHandler } from '../../manager/description/configuration_handler';
import { createAuthenticatedUserCompositionRoot } from './authenticated_user_composition_root';
import { createExecutionIssueSetupCompositionRoot } from './execution_issue_setup_composition_root';

export function createSetupExecutionUseCase(latestTagQueryPort: LatestTagQueryPort): SetupExecutionUseCase {
    const issueSetupPort = createExecutionIssueSetupCompositionRoot();
    const releaseVersion = new GetReleaseVersionUseCase(issueSetupPort);
    const releaseType = new GetReleaseTypeUseCase(issueSetupPort);
    const hotfixVersion = new GetHotfixVersionUseCase(issueSetupPort);
    return new SetupExecutionUseCase(
        issueSetupPort,
        createAuthenticatedUserCompositionRoot(),
        new ConfigurationHandler(issueSetupPort),
        new ExecutionBranchVersionResolver(
            latestTagQueryPort,
            releaseVersion,
            releaseType,
            hotfixVersion,
        ),
    );
}
