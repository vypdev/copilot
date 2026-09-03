import type { ExecutionConfigurationPort } from '../../ports/execution_configuration_ports';
import { ApplicationError } from '../../errors/application_error';
import type { ExecutionIssueSetupPort, ExecutionOrganizationSetupPort } from '../../ports/execution_setup_ports';
import type { Execution } from '../../../data/model/execution';
import { shouldSkipInitialLabelsFetch } from '../../../data/model/initial_labels_policy';
import { restorePreviousBranchState } from '../../../data/model/previous_branch_state_policy';
import { logDebugInfo, setGlobalLoggerDebug } from '../../ports/logging_ports';
import type { ExecutionBranchVersionResolution } from './execution_branch_version_resolver';
import { resolveExecutionIssueNumber } from './resolve_execution_issue_number';

export interface SetupExecutionDependencies {
    issueSetupPort: ExecutionIssueSetupPort;
    organizationSetupPort: ExecutionOrganizationSetupPort;
    configurationPort: ExecutionConfigurationPort;
    branchVersionResolver: ExecutionBranchVersionResolution;
}

export async function runSetupExecution(execution: Execution, dependencies: SetupExecutionDependencies): Promise<void> {
    setGlobalLoggerDebug(execution.debug, execution.inputs === undefined);
    await loadTokenUser(execution, dependencies.organizationSetupPort);
    if (await resolveExecutionIssueNumber(execution, dependencies.issueSetupPort) === undefined) return;

    execution.previousConfiguration = await loadPreviousConfiguration(execution, dependencies.configurationPort);
    await loadIssueLabels(execution, dependencies.issueSetupPort);
    execution.release.active = execution.labels.isRelease;
    execution.hotfix.active = execution.labels.isHotfix;
    restoreBranchState(execution);

    if (execution.isIssue && !execution.isSingleAction) {
        if (!await dependencies.branchVersionResolver.resolve(execution)) return;
    }
    if (execution.isPullRequest && !execution.isSingleAction) await loadPullRequestContext(execution, dependencies.issueSetupPort);
    execution.currentConfiguration.branchType = execution.issueType;
}

async function loadTokenUser(execution: Execution, organizationSetupPort: ExecutionOrganizationSetupPort): Promise<void> {
    if (execution.tokenUser !== undefined) return;
    execution.tokenUser = await organizationSetupPort.getUserFromToken(execution.tokens.token);
    if (!execution.tokenUser) throw new ApplicationError('Failed to get user from token', 'authorization');
}

async function loadPreviousConfiguration(execution: Execution, configurationPort: ExecutionConfigurationPort) {
    const issueNumber = configurationIssueNumber(execution);
    return issueNumber === undefined ? undefined : configurationPort.get({
        owner: execution.owner,
        repository: execution.repo,
        issueNumber,
        token: execution.tokens.token,
    });
}

async function loadIssueLabels(execution: Execution, issueSetupPort: ExecutionIssueSetupPort): Promise<void> {
    try {
        execution.labels.currentIssueLabels = await issueSetupPort.getLabels(
            execution.owner, execution.repo, execution.issueNumber, execution.tokens.token,
        );
    } catch (error) {
        if (!shouldSkipInitialLabelsFetch(execution.isSingleAction, execution.singleAction.currentSingleAction)) throw error;
        logDebugInfo('Skipping initial labels fetch for setup action.');
        execution.labels.currentIssueLabels = [];
    }
}

async function loadPullRequestContext(execution: Execution, issueSetupPort: ExecutionIssueSetupPort): Promise<void> {
    execution.labels.currentPullRequestLabels = await issueSetupPort.getLabels(
        execution.owner, execution.repo, execution.pullRequest.number, execution.tokens.token,
    );
    execution.release.active = execution.pullRequest.base.includes(`${execution.branches.releaseTree}/`);
    execution.hotfix.active = execution.pullRequest.base.includes(`${execution.branches.hotfixTree}/`);
    execution.currentConfiguration.parentBranch ??= execution.pullRequest.base;
}

function restoreBranchState(execution: Execution): void {
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

function configurationIssueNumber(execution: Execution): number | undefined {
    if (execution.isSingleAction || execution.isPush) return positiveIssueNumberOrUndefined(execution.issueNumber);
    if (execution.isIssue) return positiveIssueNumberOrUndefined(execution.issue.number);
    if (execution.isPullRequest) return positiveIssueNumberOrUndefined(execution.pullRequest.number);
    return undefined;
}

function positiveIssueNumberOrUndefined(value: number): number | undefined {
    return value > 0 && Number.isSafeInteger(value) ? value : undefined;
}
