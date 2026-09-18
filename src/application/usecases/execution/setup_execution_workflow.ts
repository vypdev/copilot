import { ApplicationError } from '../../errors/application_error';
import type {
    SetupConfigurationQueryPort,
    SetupIssueQueryPort,
    SetupOrganizationQueryPort,
} from '../../ports/setup_execution_ports';
import { shouldSkipInitialLabelsFetch } from '../../../data/model/initial_labels_policy';
import { restorePreviousBranchState } from '../../../data/model/previous_branch_state_policy';
import { ALL_ISSUE_WORKFLOWS, classifyIssueWorkflow } from '../../../domain/issue_workflow_profile';
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
    const canConfigureUnlinkedPullRequest = context.isPullRequest
        && positiveIssueNumberOrUndefined(context.pullRequest.number) !== undefined;
    if (issueResolution.issueNumber === undefined && !canConfigureUnlinkedPullRequest) {
        return { status: 'issue-unresolved', tokenUser, issueResolution };
    }

    const previousConfiguration = await loadPreviousConfiguration(
        context,
        issueResolution.issueNumber,
        dependencies.configurationPort,
    );
    const currentIssueLabels = issueResolution.issueNumber === undefined
        ? []
        : await loadIssueLabels(
            context,
            issueResolution.issueNumber,
            dependencies.issueSetupPort,
        );
    const liveIssueBody = issueResolution.issueNumber === undefined
        ? undefined
        : await dependencies.issueSetupPort.getDescription(issueResolution.issueNumber);
    const issueAdmission = issueResolution.issueNumber !== undefined
        ? classifyIssueWorkflow(currentIssueLabels, context.issueWorkflowProfile ?? ALL_ISSUE_WORKFLOWS, {
            feature: [context.labelNames.feature, context.labelNames.enhancement],
            bugfix: [context.labelNames.bugfix, context.labelNames.bug],
            documentation: [context.labelNames.documentation, context.labelNames.docs],
            chore: [context.labelNames.chore, context.labelNames.maintenance],
            help: [context.labelNames.help ?? 'help', context.labelNames.question ?? 'question'],
            hotfix: [context.labelNames.hotfix],
            release: [context.labelNames.release],
        }, liveIssueBody ?? '')
        : undefined;
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

    if (context.isIssue && !context.isSingleAction && issueResolution.issueNumber !== undefined && issueAdmission?.status === 'eligible') {
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
                    liveIssueBody,
                    issueAdmission,
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
        branchType: issueAdmission && issueAdmission.status !== 'eligible'
            ? ''
            : resolveIssueType(context, issueAdmission),
        state: setupState(
            previousConfiguration,
            currentIssueLabels,
            currentPullRequestLabels,
            release,
            hotfix,
            configuration,
            liveIssueBody,
            issueAdmission,
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
    resolvedIssueNumber: number | undefined,
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
    resolvedIssueNumber: number | undefined,
): number | undefined {
    if (context.isSingleAction || context.isPush) return positiveIssueNumberOrUndefined(resolvedIssueNumber);
    if (context.isIssue) return positiveIssueNumberOrUndefined(context.issue.number);
    if (context.isPullRequest) return positiveIssueNumberOrUndefined(context.pullRequest.number);
    return undefined;
}

function resolveIssueType(
    context: SetupExecutionContext,
    admission: SetupExecutionState['issueWorkflowAdmission'],
): string {
    if (!admission || admission.status !== 'eligible' || admission.kind === 'help') return '';
    return ({
        feature: context.branches.featureTree,
        bugfix: context.branches.bugfixTree,
        documentation: context.branches.docsTree,
        chore: context.branches.choreTree,
        hotfix: context.branches.hotfixTree,
        release: context.branches.releaseTree,
    })[admission.kind];
}

function setupState(
    previousConfiguration: SetupExecutionState['previousConfiguration'],
    currentIssueLabels: readonly string[],
    currentPullRequestLabels: readonly string[],
    release: SetupReleaseState,
    hotfix: SetupHotfixState,
    configuration: SetupConfigurationPatch,
    liveIssueBody?: string,
    issueWorkflowAdmission?: SetupExecutionState['issueWorkflowAdmission'],
): SetupExecutionState {
    return {
        previousConfiguration,
        currentIssueLabels: [...currentIssueLabels],
        currentPullRequestLabels: [...currentPullRequestLabels],
        release: { ...release },
        hotfix: { ...hotfix },
        configuration: { ...configuration },
        liveIssueBody,
        issueWorkflowAdmission,
    };
}

function positiveIssueNumberOrUndefined(value: unknown): number | undefined {
    return typeof value === 'number' && value > 0 && Number.isSafeInteger(value) ? value : undefined;
}
