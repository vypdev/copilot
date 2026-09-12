import { INPUT_KEYS } from '../application/contracts/input_keys';
import type {
    SetupConfigurationPatch,
    SetupExecutionContext,
    SetupExecutionResult,
    SetupExecutionState,
} from '../application/usecases/execution/setup_execution_contracts';

export interface SetupExecutionSource {
    readonly debug: boolean;
    readonly inputs?: unknown;
    readonly tokenUser?: string;
    readonly issueNumber: number;
    readonly eventName: string;
    readonly isSingleAction: boolean;
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly isPush: boolean;
    readonly issue: { readonly number: number };
    readonly pullRequest: {
        readonly number: number;
        readonly head: string;
        readonly base: string;
    };
    readonly commit: { readonly branch: string };
    readonly singleAction: {
        readonly issue: number;
        readonly currentSingleAction: string;
        readonly isIssue: boolean;
        readonly isPullRequest: boolean;
        readonly isPush: boolean;
    };
    readonly branches: {
        readonly featureTree: string;
        readonly bugfixTree: string;
        readonly hotfixTree: string;
        readonly releaseTree: string;
        readonly docsTree: string;
        readonly choreTree: string;
    };
    readonly labels: {
        readonly feature: string;
        readonly enhancement: string;
        readonly bugfix: string;
        readonly bug: string;
        readonly hotfix: string;
        readonly release: string;
        readonly docs: string;
        readonly documentation: string;
        readonly chore: string;
        readonly maintenance: string;
        readonly currentPullRequestLabels: readonly string[];
    };
    readonly release: {
        readonly active: boolean;
        readonly type?: string;
        readonly version?: string;
        readonly branch?: string;
    };
    readonly hotfix: {
        readonly active: boolean;
        readonly baseVersion?: string;
        readonly version?: string;
        readonly baseBranch?: string;
        readonly branch?: string;
    };
}

export interface SetupExecutionTarget {
    tokenUser?: string;
    issueNumber: number;
    singleAction: {
        issue: number;
        isIssue: boolean;
        isPullRequest: boolean;
        isPush: boolean;
    };
    labels: {
        currentIssueLabels: string[];
        currentPullRequestLabels: string[];
    };
    release: {
        active: boolean;
        type?: string;
        version?: string;
        branch?: string;
    };
    hotfix: {
        active: boolean;
        baseVersion?: string;
        version?: string;
        baseBranch?: string;
        branch?: string;
    };
    previousConfiguration: SetupExecutionState['previousConfiguration'];
    currentConfiguration: {
        branchType: string;
        deploymentOrchestration: SetupConfigurationPatch['deploymentOrchestration'];
        releaseOriginBranch?: string;
        releaseOriginSha?: string;
        hotfixOriginSha?: string;
        parentBranch?: string;
        workingBranch?: string;
        releaseBranch?: string;
        hotfixOriginBranch?: string;
        hotfixBranch?: string;
    };
}

export function projectSetupExecutionContext(source: SetupExecutionSource): SetupExecutionContext {
    const configuredIssue = readConfiguredIssue(source.inputs);
    return Object.freeze({
        debug: source.debug,
        local: source.inputs === undefined,
        tokenUser: source.tokenUser,
        issueNumber: source.issueNumber,
        eventName: source.eventName,
        configuredSingleActionIssue: configuredIssue,
        isSingleAction: source.isSingleAction,
        isIssue: source.isIssue,
        isPullRequest: source.isPullRequest,
        isPush: source.isPush,
        issue: Object.freeze({ number: source.issue.number }),
        pullRequest: Object.freeze({
            number: source.pullRequest.number,
            head: source.pullRequest.head,
            base: source.pullRequest.base,
        }),
        commit: Object.freeze({ branch: source.commit.branch }),
        singleAction: Object.freeze({
            issue: source.singleAction.issue,
            currentAction: source.singleAction.currentSingleAction,
            isIssue: source.singleAction.isIssue,
            isPullRequest: source.singleAction.isPullRequest,
            isPush: source.singleAction.isPush,
        }),
        branches: Object.freeze({
            featureTree: source.branches.featureTree,
            bugfixTree: source.branches.bugfixTree,
            hotfixTree: source.branches.hotfixTree,
            releaseTree: source.branches.releaseTree,
            docsTree: source.branches.docsTree,
            choreTree: source.branches.choreTree,
        }),
        labelNames: Object.freeze({
            feature: source.labels.feature,
            enhancement: source.labels.enhancement,
            bugfix: source.labels.bugfix,
            bug: source.labels.bug,
            hotfix: source.labels.hotfix,
            release: source.labels.release,
            docs: source.labels.docs,
            documentation: source.labels.documentation,
            chore: source.labels.chore,
            maintenance: source.labels.maintenance,
        }),
        currentPullRequestLabels: Object.freeze([...source.labels.currentPullRequestLabels]),
        release: Object.freeze({
            active: source.release.active,
            type: source.release.type,
            version: source.release.version,
            branch: source.release.branch,
        }),
        hotfix: Object.freeze({
            active: source.hotfix.active,
            baseVersion: source.hotfix.baseVersion,
            version: source.hotfix.version,
            baseBranch: source.hotfix.baseBranch,
            branch: source.hotfix.branch,
        }),
    });
}

export function applySetupExecutionResult(target: SetupExecutionTarget, result: SetupExecutionResult): void {
    target.tokenUser = result.tokenUser;
    if (result.issueResolution.issueNumber !== undefined) {
        target.issueNumber = result.issueResolution.issueNumber;
    }
    target.singleAction.issue = result.issueResolution.singleAction.issue;
    target.singleAction.isIssue = result.issueResolution.singleAction.isIssue;
    target.singleAction.isPullRequest = result.issueResolution.singleAction.isPullRequest;
    target.singleAction.isPush = result.issueResolution.singleAction.isPush;
    if (result.status === 'issue-unresolved') return;

    applySetupState(target, result.state);
    if (result.status === 'configured') target.currentConfiguration.branchType = result.branchType;
}

function applySetupState(target: SetupExecutionTarget, state: SetupExecutionState): void {
    target.previousConfiguration = state.previousConfiguration;
    target.labels.currentIssueLabels = [...state.currentIssueLabels];
    target.labels.currentPullRequestLabels = [...state.currentPullRequestLabels];
    target.release.active = state.release.active;
    target.release.type = state.release.type;
    target.release.version = state.release.version;
    target.release.branch = state.release.branch;
    target.hotfix.active = state.hotfix.active;
    target.hotfix.baseVersion = state.hotfix.baseVersion;
    target.hotfix.version = state.hotfix.version;
    target.hotfix.baseBranch = state.hotfix.baseBranch;
    target.hotfix.branch = state.hotfix.branch;
    target.currentConfiguration.deploymentOrchestration = state.configuration.deploymentOrchestration;
    target.currentConfiguration.releaseOriginBranch = state.configuration.releaseOriginBranch;
    target.currentConfiguration.releaseOriginSha = state.configuration.releaseOriginSha;
    target.currentConfiguration.hotfixOriginSha = state.configuration.hotfixOriginSha;
    target.currentConfiguration.parentBranch = state.configuration.parentBranch;
    target.currentConfiguration.workingBranch = state.configuration.workingBranch;
    target.currentConfiguration.releaseBranch = state.configuration.releaseBranch;
    target.currentConfiguration.hotfixOriginBranch = state.configuration.hotfixOriginBranch;
    target.currentConfiguration.hotfixBranch = state.configuration.hotfixBranch;
}

function readConfiguredIssue(inputs: unknown): string | number | undefined {
    if (typeof inputs !== 'object' || inputs === null) return undefined;
    const value = (inputs as Record<string, unknown>)[INPUT_KEYS.SINGLE_ACTION_ISSUE];
    return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}
