import type { ExecutionConfigurationPort } from '../../ports/execution_configuration_ports';
import type { ExecutionIssueSetupPort, ExecutionOrganizationSetupPort } from '../../ports/execution_setup_ports';
import type { Execution } from '../../../data/model/execution';
import { shouldSkipInitialLabelsFetch } from '../../../data/model/initial_labels_policy';
import { restorePreviousBranchState } from '../../../data/model/previous_branch_state_policy';
import { logDebugInfo, setGlobalLoggerDebug } from '../../../utils/logger';
import type { ParamUseCase } from '../base/param_usecase';
import type { ExecutionBranchVersionResolution } from './execution_branch_version_resolver';
import { resolveExecutionIssueNumber } from './resolve_execution_issue_number';

export class SetupExecutionUseCase implements ParamUseCase<Execution, void> {
    taskId = 'SetupExecutionUseCase';

    constructor(
        private readonly issueSetupPort: ExecutionIssueSetupPort,
        private readonly organizationSetupPort: ExecutionOrganizationSetupPort,
        private readonly configurationPort: ExecutionConfigurationPort,
        private readonly branchVersionResolver: ExecutionBranchVersionResolution,
    ) {}

    async invoke(execution: Execution): Promise<void> {
        setGlobalLoggerDebug(execution.debug, execution.inputs === undefined);
        execution.tokenUser = await this.organizationSetupPort.getUserFromToken(execution.tokens.token);
        if (!execution.tokenUser) throw new Error('Failed to get user from token');

        if (await resolveExecutionIssueNumber(execution, this.issueSetupPort) === undefined) return;
        const configurationIssueNumber = this.configurationIssueNumber(execution);
        execution.previousConfiguration = configurationIssueNumber === undefined
            ? undefined
            : await this.configurationPort.get({
                owner: execution.owner,
                repository: execution.repo,
                issueNumber: configurationIssueNumber,
                token: execution.tokens.token,
            });

        try {
            execution.labels.currentIssueLabels = await this.issueSetupPort.getLabels(
                execution.owner,
                execution.repo,
                execution.issueNumber,
                execution.tokens.token,
            );
        } catch (error) {
            if (!shouldSkipInitialLabelsFetch(
                execution.isSingleAction,
                execution.singleAction.currentSingleAction,
            )) throw error;
            logDebugInfo('Skipping initial labels fetch for setup action.');
            execution.labels.currentIssueLabels = [];
        }

        execution.release.active = execution.labels.isRelease;
        execution.hotfix.active = execution.labels.isHotfix;
        this.restorePreviousState(execution);

        if (execution.isIssue) {
            if (!execution.isSingleAction && !await this.branchVersionResolver.resolve(execution)) return;
        } else if (execution.isPullRequest && !execution.isSingleAction) {
            execution.labels.currentPullRequestLabels = await this.issueSetupPort.getLabels(
                execution.owner,
                execution.repo,
                execution.pullRequest.number,
                execution.tokens.token,
            );
            execution.release.active = execution.pullRequest.base.includes(`${execution.branches.releaseTree}/`);
            execution.hotfix.active = execution.pullRequest.base.includes(`${execution.branches.hotfixTree}/`);
            execution.currentConfiguration.parentBranch ??= execution.pullRequest.base;
        }

        execution.currentConfiguration.branchType = execution.issueType;
    }

    private restorePreviousState(execution: Execution): void {
        const state = restorePreviousBranchState(
            execution.previousConfiguration,
            execution.release.active ? 'release' : execution.hotfix.active ? 'hotfix' : 'default',
            execution.branches.releaseTree,
            execution.branches.hotfixTree,
        );
        execution.release.version = state.releaseVersion;
        execution.release.branch = state.releaseBranch;
        execution.hotfix.baseVersion = state.hotfixBaseVersion;
        execution.hotfix.baseBranch = state.hotfixBaseBranch;
        execution.hotfix.version = state.hotfixVersion;
        execution.hotfix.branch = state.hotfixBranch;
        execution.currentConfiguration.parentBranch = state.parentBranch;
        execution.currentConfiguration.workingBranch = state.workingBranch;
        execution.currentConfiguration.releaseBranch = state.releaseBranch;
        execution.currentConfiguration.hotfixOriginBranch = state.hotfixBaseBranch;
        execution.currentConfiguration.hotfixBranch = state.hotfixBranch;
    }

    private configurationIssueNumber(execution: Execution): number | undefined {
        if (execution.isSingleAction || execution.isPush) return execution.issueNumber;
        if (execution.isIssue) return execution.issue.number;
        if (execution.isPullRequest) return execution.pullRequest.number;
        return undefined;
    }
}
