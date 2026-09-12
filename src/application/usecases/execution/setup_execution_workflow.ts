import { ApplicationError } from '../../errors/application_error';
import type {
    SetupConfigurationQueryPort,
    SetupIssueQueryPort,
    SetupOrganizationQueryPort,
} from '../../ports/setup_execution_ports';
import { shouldSkipInitialLabelsFetch } from '../../../data/model/initial_labels_policy';
import { restorePreviousBranchState } from '../../../data/model/previous_branch_state_policy';
import { typesForIssue } from '../../../data/model/label_branch_policy';
import { logDebugInfo, setGlobalLoggerDebug } from '../../ports/logging_ports';
import type { ExecutionBranchVersionResolution } from './execution_branch_version_resolver';
import { resolveExecutionIssueNumber } from './resolve_execution_issue_number';
import type {
    SetupConfigurationPatch,
    SetupExecutionContext,
    SetupExecutionResult,
    SetupExecutionState,
    SetupHotfixState,
    SetupReleaseState,
} from './setup_execution_contracts';

export interface SetupExecutionDependencies {
    readonly issueSetupPort: SetupIssueQueryPort;
    readonly organizationSetupPort: SetupOrganizationQueryPort;
    readonly configurationPort: SetupConfigurationQueryPort;
    readonly branchVersionResolver: ExecutionBranchVersionResolution;
}

export async function runSetupExecution(
    context: SetupExecutionContext,
    dependencies: SetupExecutionDependencies,
): Promise<SetupExecutionResult> {
    setGlobalLoggerDebug(context.debug, context.local);
    const tokenUser = await loadTokenUser(context, dependencies.organizationSetupPort);
    const issueResolution = await resolveExecutionIssueNumber(context, dependencies.issueSetupPort);
    if (issueResolution.issueNumber === undefined) {
        return { status: 'issue-unresolved', tokenUser, issueResolution };
    }

    const previousConfiguration = await loadPreviousConfiguration(
        context,
        issueResolution.issueNumber,
        dependencies.configurationPort,
    );
    const currentIssueLabels = await loadIssueLabels(
        context,
        issueResolution.issueNumber,
        dependencies.issueSetupPort,
    );
    let release: SetupReleaseState = {
        ...context.release,
        active: currentIssueLabels.includes(context.labelNames.release),
    };
    let hotfix: SetupHotfixState = {
        ...context.hotfix,
        active: currentIssueLabels.includes(context.labelNames.hotfix),
    };
    const restored = restorePreviousBranchState(
        previousConfiguration,
        release.active ? 'release' : hotfix.active ? 'hotfix' : 'default',
        context.branches.releaseTree,
        context.branches.hotfixTree,
    );
    release = {
        ...release,
        version: restored.releaseVersion,
        branch: restored.releaseBranch,
    };
    hotfix = {
        ...hotfix,
        baseVersion: restored.hotfixBaseVersion,
        baseBranch: restored.hotfixBaseBranch,
        version: restored.hotfixVersion,
        branch: restored.hotfixBranch,
    };
    let configuration: SetupConfigurationPatch = {
        deploymentOrchestration: previousConfiguration?.deploymentOrchestration,
        releaseOriginBranch: previousConfiguration?.releaseOriginBranch,
        releaseOriginSha: previousConfiguration?.releaseOriginSha,
        hotfixOriginSha: previousConfiguration?.hotfixOriginSha,
        parentBranch: restored.parentBranch,
        workingBranch: restored.workingBranch,
        releaseBranch: restored.releaseBranch,
        hotfixOriginBranch: restored.hotfixBaseBranch,
        hotfixBranch: restored.hotfixBranch,
    };
    let currentPullRequestLabels = [...context.currentPullRequestLabels];

    if (context.isIssue && !context.isSingleAction) {
        const resolution = await dependencies.branchVersionResolver.resolve({
            issueNumber: issueResolution.issueNumber,
            release,
            hotfix,
            branches: {
                releaseTree: context.branches.releaseTree,
                hotfixTree: context.branches.hotfixTree,
            },
            configuration,
        });
        release = resolution.release;
        hotfix = resolution.hotfix;
        configuration = resolution.configuration;
        if (!resolution.completed) {
            return {
                status: 'version-unresolved',
                tokenUser,
                issueResolution,
                state: setupState(
                    previousConfiguration,
                    currentIssueLabels,
                    currentPullRequestLabels,
                    release,
                    hotfix,
                    configuration,
                ),
            };
        }
    }

    if (context.isPullRequest && !context.isSingleAction) {
        currentPullRequestLabels = await dependencies.issueSetupPort.getLabels(context.pullRequest.number);
        release = {
            ...release,
            active: context.pullRequest.base.includes(`${context.branches.releaseTree}/`),
        };
        hotfix = {
            ...hotfix,
            active: context.pullRequest.base.includes(`${context.branches.hotfixTree}/`),
        };
        configuration = {
            ...configuration,
            parentBranch: configuration.parentBranch ?? context.pullRequest.base,
        };
    }

    return {
        status: 'configured',
        tokenUser,
        issueResolution,
        branchType: resolveIssueType(context, currentIssueLabels),
        state: setupState(
            previousConfiguration,
            currentIssueLabels,
            currentPullRequestLabels,
            release,
            hotfix,
            configuration,
        ),
    };
}

async function loadTokenUser(
    context: SetupExecutionContext,
    organizationSetupPort: SetupOrganizationQueryPort,
): Promise<string> {
    if (context.tokenUser !== undefined) return context.tokenUser;
    const tokenUser = await organizationSetupPort.getTokenUser();
    if (!tokenUser) {
        throw new ApplicationError('authorization.credential-invalid', 'Failed to get user from token.');
    }
    return tokenUser;
}

async function loadPreviousConfiguration(
    context: SetupExecutionContext,
    resolvedIssueNumber: number,
    configurationPort: SetupConfigurationQueryPort,
) {
    const issueNumber = configurationIssueNumber(context, resolvedIssueNumber);
    return issueNumber === undefined ? undefined : configurationPort.get(issueNumber);
}

async function loadIssueLabels(
    context: SetupExecutionContext,
    issueNumber: number,
    issueSetupPort: SetupIssueQueryPort,
): Promise<string[]> {
    try {
        return await issueSetupPort.getLabels(issueNumber);
    } catch (error) {
        if (!shouldSkipInitialLabelsFetch(context.isSingleAction, context.singleAction.currentAction)) throw error;
        logDebugInfo('Skipping initial labels fetch for setup action.');
        return [];
    }
}

function configurationIssueNumber(
    context: SetupExecutionContext,
    resolvedIssueNumber: number,
): number | undefined {
    if (context.isSingleAction || context.isPush) return positiveIssueNumberOrUndefined(resolvedIssueNumber);
    if (context.isIssue) return positiveIssueNumberOrUndefined(context.issue.number);
    if (context.isPullRequest) return positiveIssueNumberOrUndefined(context.pullRequest.number);
    return undefined;
}

function resolveIssueType(context: SetupExecutionContext, currentIssueLabels: readonly string[]): string {
    return typesForIssue(
        { branches: context.branches },
        [...currentIssueLabels],
        context.labelNames.feature,
        context.labelNames.enhancement,
        context.labelNames.bugfix,
        context.labelNames.bug,
        context.labelNames.hotfix,
        context.labelNames.release,
        context.labelNames.docs,
        context.labelNames.documentation,
        context.labelNames.chore,
        context.labelNames.maintenance,
    );
}

function setupState(
    previousConfiguration: SetupExecutionState['previousConfiguration'],
    currentIssueLabels: readonly string[],
    currentPullRequestLabels: readonly string[],
    release: SetupReleaseState,
    hotfix: SetupHotfixState,
    configuration: SetupConfigurationPatch,
): SetupExecutionState {
    return {
        previousConfiguration,
        currentIssueLabels: [...currentIssueLabels],
        currentPullRequestLabels: [...currentPullRequestLabels],
        release: { ...release },
        hotfix: { ...hotfix },
        configuration: { ...configuration },
    };
}

function positiveIssueNumberOrUndefined(value: number): number | undefined {
    return value > 0 && Number.isSafeInteger(value) ? value : undefined;
}
