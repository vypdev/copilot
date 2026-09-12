import type { Config } from '../../../data/model/config';
import type { DeploymentOperationSnapshot } from '../../../domain/deployment_operation';

export interface SetupExecutionContext {
    readonly debug: boolean;
    readonly local: boolean;
    readonly tokenUser?: string;
    readonly issueNumber: number;
    readonly eventName: string;
    readonly configuredSingleActionIssue?: string | number;
    readonly isSingleAction: boolean;
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly isPush: boolean;
    readonly issue: {
        readonly number: number;
    };
    readonly pullRequest: {
        readonly number: number;
        readonly head: string;
        readonly base: string;
    };
    readonly commit: {
        readonly branch: string;
    };
    readonly singleAction: {
        readonly issue: number;
        readonly currentAction: string;
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
    readonly labelNames: {
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
    };
    readonly currentPullRequestLabels: readonly string[];
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

export interface ResolvedSingleActionState {
    readonly issue: number;
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly isPush: boolean;
}

export interface ExecutionIssueResolution {
    readonly issueNumber?: number;
    readonly singleAction: ResolvedSingleActionState;
}

export interface SetupReleaseState {
    readonly active: boolean;
    readonly type?: string;
    readonly version?: string;
    readonly branch?: string;
}

export interface SetupHotfixState {
    readonly active: boolean;
    readonly baseVersion?: string;
    readonly version?: string;
    readonly baseBranch?: string;
    readonly branch?: string;
}

export interface SetupConfigurationPatch {
    readonly deploymentOrchestration?: DeploymentOperationSnapshot;
    readonly releaseOriginBranch?: string;
    readonly releaseOriginSha?: string;
    readonly hotfixOriginSha?: string;
    readonly parentBranch?: string;
    readonly workingBranch?: string;
    readonly releaseBranch?: string;
    readonly hotfixOriginBranch?: string;
    readonly hotfixBranch?: string;
}

export interface SetupExecutionState {
    readonly previousConfiguration?: Config;
    readonly currentIssueLabels: readonly string[];
    readonly currentPullRequestLabels: readonly string[];
    readonly release: SetupReleaseState;
    readonly hotfix: SetupHotfixState;
    readonly configuration: SetupConfigurationPatch;
}

interface SetupExecutionBaseResult {
    readonly tokenUser: string;
    readonly issueResolution: ExecutionIssueResolution;
}

export type SetupExecutionResult =
    | (SetupExecutionBaseResult & { readonly status: 'issue-unresolved' })
    | (SetupExecutionBaseResult & {
        readonly status: 'version-unresolved';
        readonly state: SetupExecutionState;
    })
    | (SetupExecutionBaseResult & {
        readonly status: 'configured';
        readonly branchType: string;
        readonly state: SetupExecutionState;
    });

export interface VersionDescriptionContext {
    readonly issueNumber: number;
}
