import type { AgentConfiguration } from '../../domain/agent';
import type { CopilotLifecycleLabels } from '../../domain/copilot_lifecycle';
import type { DeploymentOperationSnapshot } from '../../domain/deployment_operation';
import type { DeploymentOrchestrationContext } from '../ports/deployment_orchestration_ports';
import type {
  SetupConfiguration,
  SetupCredentialCollection,
  SetupRemoteConfiguration,
} from '../../domain/setup';
import type { EventCommitPayload } from '../../data/model/execution_inputs';
import { restoreRecommendationState, type RecommendationState } from '../../data/model/recommendation_state';
import type { ProjectReference } from '../ports/project_board_link_ports';
import type {
  InitialIssueTypeConfiguration,
  InitialLabelConfiguration,
} from '../ports/issue_management_ports';
import type { IssueCommentPublicationRequest } from '../policies/issue_comment_publication_policy';
import { resolveIssueCommentPublicationRequest } from '../policies/issue_comment_publication_policy';
import { canonicalGitObjectId } from '../../domain/git_object_id';

export interface DeploymentPublicationContext {
  readonly requestedOperationId: string;
  readonly requestedVersion: string;
  readonly operation?: DeploymentOperationSnapshot;
}

export interface ProgressContext {
  readonly issueNumber: number;
  readonly pushedBranch: string;
  readonly developmentBranch: string;
  readonly branchTypes: readonly string[];
  readonly agentConfiguration: Readonly<AgentConfiguration>;
  readonly includeReasoning: boolean;
  readonly targetLocale: string;
  readonly sourceHeadSha?: string;
}

export interface RecommendStepsContext {
  readonly issueNumber: number;
  readonly eventName: string;
  readonly eventAction: string;
  readonly tokenUser?: string;
  readonly previousRecommendation?: Readonly<RecommendationState>;
  readonly agentConfiguration: Readonly<AgentConfiguration>;
  readonly targetLocale: string;
}

export interface RecommendationStatePatch {
  readonly recommendationState: Readonly<RecommendationState>;
}

export interface RecommendStepsOutcome {
  readonly results: readonly import('../../data/model/result').Result[];
  readonly configurationPatch?: RecommendationStatePatch;
}

export interface InactivityContext {
  readonly waitingLabels: readonly string[];
  readonly activityLabel: string;
  readonly thresholdHours: number;
  readonly locale: string;
  readonly repositoryLocale: string;
  readonly agentConfiguration: Readonly<AgentConfiguration>;
}

export interface BranchObservationContext {
  readonly pushedBranch: string;
  readonly deletedPush: boolean;
  readonly sourceHeadSha?: string;
  readonly trustedBotLogin?: string;
  readonly repository: { readonly owner: string; readonly name: string };
  readonly locale: string;
  readonly agentConfiguration: Readonly<AgentConfiguration>;
}

export interface UserRequestContext {
  readonly issueNumber: number;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly repository: { readonly owner: string; readonly name: string };
  readonly agentConfiguration: Readonly<AgentConfiguration>;
}

export interface BranchSyncContext {
  readonly conversationNumber: number;
  readonly repository: { readonly owner: string; readonly name: string };
  readonly agentConfiguration: Readonly<AgentConfiguration>;
  readonly verifyCommands: readonly string[];
}

export interface CommitNotificationContext {
  readonly issueNumber: number;
  readonly branch: string;
  readonly commits: readonly Readonly<EventCommitPayload>[];
  readonly commitPrefixBuilder: string;
  readonly reopenOnPush: boolean;
  readonly theme: 'release' | 'hotfix' | 'bugfix' | 'feature' | 'docs' | 'chore' | 'automatic';
  readonly imagesOnCommit: boolean;
  readonly themeImages: readonly string[];
}

export interface ChangeSizeThreshold {
  readonly lines: number;
  readonly files: number;
  readonly commits: number;
}

export interface ChangeSizeContext {
  readonly issueNumber: number;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly thresholds: Readonly<Record<'xxl' | 'xl' | 'l' | 'm' | 's' | 'xs', ChangeSizeThreshold>>;
  readonly labels: Readonly<Record<'xxl' | 'xl' | 'l' | 'm' | 's' | 'xs', string>>;
  readonly currentSize?: string;
  readonly currentIssueLabels: readonly string[];
  readonly projects: readonly ProjectReference[];
}

export interface AgentActivityContext {
  readonly target?: {
    readonly kind: 'issue' | 'pull-request';
    readonly number: number;
    readonly labels: readonly string[];
  };
  readonly activityLabel: string;
}

export interface AgentActivityOutcome {
  readonly target?: AgentActivityContext['target'];
  readonly labels?: readonly string[];
}

export interface InitialSetupContext {
  readonly labels: InitialLabelConfiguration;
  readonly issueTypes: InitialIssueTypeConfiguration;
  readonly setupConfiguration?: Readonly<SetupConfiguration>;
  readonly setupCredentials?: Readonly<SetupCredentialCollection>;
  readonly setupRemoteConfiguration?: Readonly<SetupRemoteConfiguration>;
  readonly workflowUpdates: readonly string[];
}

export type IssueCommentActionContext =
  | { readonly kind: 'invalid'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly issueNumber: number;
      readonly request: IssueCommentPublicationRequest;
    };

export interface PushSingleActionContextSource {
  readonly owner: string;
  readonly repo: string;
  readonly issueNumber: number;
  readonly eventName: string;
  readonly tokenUser?: string;
  readonly locale?: { readonly repository?: string; readonly issue?: string; readonly pullRequest?: string };
  readonly inputs?: {
    readonly action?: string;
    readonly after?: string;
    readonly setupConfiguration?: unknown;
    readonly setupCredentials?: unknown;
    readonly setupRemoteConfiguration?: unknown;
    readonly setupWorkflowUpdates?: unknown;
  };
  readonly commit: { readonly branch: string; readonly commits: readonly EventCommitPayload[] };
  readonly currentConfiguration: {
    readonly parentBranch?: string;
    readonly deploymentOrchestration?: DeploymentOperationSnapshot;
  };
  readonly previousConfiguration?: { readonly recommendationState?: RecommendationState };
  readonly branches: {
    readonly development: string;
    readonly featureTree: string;
    readonly bugfixTree: string;
    readonly docsTree: string;
    readonly choreTree: string;
    readonly hotfixTree: string;
    readonly releaseTree: string;
  };
  readonly ai: {
    getAgentConfiguration(task: 'planner' | 'findings' | 'fixer'): AgentConfiguration;
    getAiIncludeReasoning(): boolean;
    getBugbotFixVerifyCommands(): string[];
  };
  readonly singleAction: {
    readonly operationId: string;
    readonly version: string;
    readonly issue: number;
    readonly message: string;
    readonly commentId: number;
    readonly commentIdInput: string;
    readonly commentMode: string;
  };
  readonly inactivityThresholdHours: number;
  readonly labels: {
    readonly lifecycle: CopilotLifecycleLabels;
    readonly currentIssueLabels: readonly string[];
    readonly currentPullRequestLabels: readonly string[];
    readonly sizeXxl: string;
    readonly sizeXl: string;
    readonly sizeL: string;
    readonly sizeM: string;
    readonly sizeS: string;
    readonly sizeXs: string;
    readonly sizedLabelOnIssue?: string;
    readonly isRelease: boolean;
    readonly isHotfix: boolean;
  } & InitialLabelConfiguration;
  readonly sizeThresholds: Readonly<Record<'xxl' | 'xl' | 'l' | 'm' | 's' | 'xs', ChangeSizeThreshold>>;
  readonly project: { getProjects(): readonly ProjectReference[] };
  readonly issue: { readonly number: number; readonly reopenOnPush: boolean };
  readonly pullRequest: { readonly number: number };
  readonly release: { readonly active: boolean };
  readonly hotfix: { readonly active: boolean };
  readonly images: {
    readonly imagesOnCommit: boolean;
    readonly commitAutomaticActions: readonly string[];
    readonly commitFeatureGifs: readonly string[];
    readonly commitBugfixGifs: readonly string[];
    readonly commitReleaseGifs: readonly string[];
    readonly commitHotfixGifs: readonly string[];
    readonly commitDocsGifs: readonly string[];
    readonly commitChoreGifs: readonly string[];
  };
  readonly isBugfix: boolean;
  readonly isFeature: boolean;
  readonly isDocs: boolean;
  readonly isChore: boolean;
  readonly commitPrefixBuilder: string;
  readonly issueTypes: InitialIssueTypeConfiguration;
}

export function projectDeploymentPublicationContext(source: PushSingleActionContextSource): DeploymentPublicationContext {
  return Object.freeze({
    requestedOperationId: source.singleAction.operationId,
    requestedVersion: source.singleAction.version,
    ...(source.currentConfiguration.deploymentOrchestration
      ? { operation: copyDeploymentOperation(source.currentConfiguration.deploymentOrchestration) }
      : {}),
  });
}

export function projectDeploymentOrchestrationContext(
  source: DeploymentOrchestrationContext & {
    readonly ai?: { getAgentConfiguration(task: 'planner'): AgentConfiguration };
  },
): DeploymentOrchestrationContext {
  return {
    owner: source.owner,
    repo: source.repo,
    branches: Object.freeze({ ...source.branches }),
    workflows: Object.freeze({ ...source.workflows }),
    locale: Object.freeze({ ...source.locale }),
    ...(source.agentConfiguration
      ? { agentConfiguration: Object.freeze({ ...source.agentConfiguration }) }
      : source.ai
        ? { agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('planner') }) }
        : {}),
    labels: Object.freeze({
      ...source.labels,
      lifecycle: Object.freeze({ ...source.labels.lifecycle }),
    }),
    deployment: deepFreezeCopy(source.deployment) as DeploymentOrchestrationContext['deployment'],
    singleAction: Object.freeze({ ...source.singleAction }),
    pullRequest: Object.freeze({ ...source.pullRequest }),
    currentConfiguration: {
      ...source.currentConfiguration,
      ...(source.currentConfiguration.deploymentOrchestration
        ? { deploymentOrchestration: copyDeploymentOperation(source.currentConfiguration.deploymentOrchestration) }
        : {}),
    },
  };
}

export function projectProgressContext(source: PushSingleActionContextSource): ProgressContext {
  const sourceHeadSha = canonicalGitObjectId(source.inputs?.after);
  return Object.freeze({
    issueNumber: source.issueNumber,
    pushedBranch: source.commit.branch,
    developmentBranch: source.branches.development || 'develop',
    branchTypes: Object.freeze([
      source.branches.featureTree,
      source.branches.bugfixTree,
      source.branches.docsTree,
      source.branches.choreTree,
      source.branches.hotfixTree,
      source.branches.releaseTree,
    ]),
    agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('findings') }),
    includeReasoning: source.ai.getAiIncludeReasoning(),
    targetLocale: source.locale?.issue ?? 'en-US',
    ...(sourceHeadSha ? { sourceHeadSha } : {}),
  });
}

export function projectRecommendStepsContext(source: PushSingleActionContextSource): RecommendStepsContext {
  const previous = restoreRecommendationState(source.previousConfiguration?.recommendationState);
  return Object.freeze({
    issueNumber: source.issueNumber,
    eventName: source.eventName,
    eventAction: source.inputs?.action ?? '',
    ...(source.tokenUser ? { tokenUser: source.tokenUser } : {}),
    ...(previous ? { previousRecommendation: previous } : {}),
    agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('planner') }),
    targetLocale: source.locale?.issue ?? 'en-US',
  });
}

export function projectInactivityContext(source: PushSingleActionContextSource): InactivityContext {
  return Object.freeze({
    waitingLabels: Object.freeze([
      source.labels.lifecycle.awaitingMaintainer,
      source.labels.lifecycle.awaitingIssueAuthor,
    ]),
    activityLabel: source.labels.lifecycle.aiProcessing,
    thresholdHours: source.inactivityThresholdHours,
    locale: source.locale?.issue ?? 'en-US',
    repositoryLocale: source.locale?.repository ?? 'en-US',
    agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('planner') }),
  });
}

export function projectBranchObservationContext(source: PushSingleActionContextSource): BranchObservationContext {
  const deletedPush = typeof source.inputs?.after === 'string' && /^0+$/u.test(source.inputs.after);
  const sourceHeadSha = deletedPush ? undefined : canonicalGitObjectId(source.inputs?.after);
  return Object.freeze({
    pushedBranch: source.commit.branch.trim(),
    deletedPush,
    ...(sourceHeadSha ? { sourceHeadSha } : {}),
    ...(source.tokenUser ? { trustedBotLogin: source.tokenUser } : {}),
    repository: Object.freeze({ owner: source.owner, name: source.repo }),
    locale: source.locale?.issue ?? 'en-US',
    agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('planner') }),
  });
}

export function projectUserRequestContext(source: PushSingleActionContextSource): UserRequestContext {
  return Object.freeze({
    issueNumber: source.issueNumber,
    headBranch: source.commit.branch,
    baseBranch: source.currentConfiguration.parentBranch ?? source.branches.development ?? 'develop',
    repository: Object.freeze({ owner: source.owner, name: source.repo }),
    agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('fixer') }),
  });
}

export function projectBranchSyncContext(source: PushSingleActionContextSource): BranchSyncContext {
  return Object.freeze({
    conversationNumber: [source.pullRequest.number, source.issue.number, source.issueNumber]
      .find(candidate => candidate > 0) ?? -1,
    repository: Object.freeze({ owner: source.owner, name: source.repo }),
    agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('fixer') }),
    verifyCommands: Object.freeze([...source.ai.getBugbotFixVerifyCommands()]),
  });
}

export function projectCommitNotificationContext(source: PushSingleActionContextSource): CommitNotificationContext {
  const theme = commitTheme(source);
  return Object.freeze({
    issueNumber: source.issueNumber,
    branch: source.commit.branch,
    commits: Object.freeze(source.commit.commits.map(commit => Object.freeze({
      ...commit,
      ...(commit.author ? { author: Object.freeze({ ...commit.author }) } : {}),
    }))),
    commitPrefixBuilder: source.commitPrefixBuilder,
    reopenOnPush: source.issue.reopenOnPush,
    theme: theme.kind,
    imagesOnCommit: source.images.imagesOnCommit,
    themeImages: Object.freeze([...theme.images]),
  });
}

export function projectChangeSizeContext(source: PushSingleActionContextSource): ChangeSizeContext {
  const keys = ['xxl', 'xl', 'l', 'm', 's', 'xs'] as const;
  const thresholdEntries = keys.map(key => [key, Object.freeze({ ...source.sizeThresholds[key] })]);
  return Object.freeze({
    issueNumber: source.issueNumber,
    headBranch: source.commit.branch,
    baseBranch: source.currentConfiguration.parentBranch ?? source.branches.development ?? 'develop',
    thresholds: Object.freeze(Object.fromEntries(thresholdEntries)) as ChangeSizeContext['thresholds'],
    labels: Object.freeze({
      xxl: source.labels.sizeXxl,
      xl: source.labels.sizeXl,
      l: source.labels.sizeL,
      m: source.labels.sizeM,
      s: source.labels.sizeS,
      xs: source.labels.sizeXs,
    }),
    ...(source.labels.sizedLabelOnIssue ? { currentSize: source.labels.sizedLabelOnIssue } : {}),
    currentIssueLabels: Object.freeze([...source.labels.currentIssueLabels]),
    projects: Object.freeze(source.project.getProjects().map(project => Object.freeze({ ...project }))),
  });
}

export function projectInitialSetupContext(source: PushSingleActionContextSource): InitialSetupContext {
  const configuration = asObject<SetupConfiguration>(source.inputs?.setupConfiguration);
  const credentials = asObject<SetupCredentialCollection>(source.inputs?.setupCredentials);
  const remote = asObject<SetupRemoteConfiguration>(source.inputs?.setupRemoteConfiguration);
  return Object.freeze({
    labels: copyInitialLabels(source.labels),
    issueTypes: Object.freeze({ ...source.issueTypes }),
    ...(configuration ? { setupConfiguration: deepFreezeCopy(configuration) } : {}),
    ...(credentials ? { setupCredentials: deepFreezeCopy(credentials) } : {}),
    ...(remote ? { setupRemoteConfiguration: deepFreezeCopy(remote) } : {}),
    workflowUpdates: Object.freeze(asStringArray(source.inputs?.setupWorkflowUpdates)),
  });
}

export function projectIssueCommentActionContext(source: PushSingleActionContextSource): IssueCommentActionContext {
  const request = resolveIssueCommentPublicationRequest(source.singleAction);
  return request instanceof Error
    ? Object.freeze({ kind: 'invalid', message: request.message })
    : Object.freeze({ kind: 'ready', issueNumber: source.singleAction.issue, request: Object.freeze({ ...request }) });
}

export function projectAgentActivityContext(source: PushSingleActionContextSource): AgentActivityContext {
  const pullRequest = source.eventName === 'pull_request' || source.eventName === 'pull_request_review_comment';
  const number = pullRequest
    ? source.pullRequest.number
    : source.issue.number > 0 ? source.issue.number : source.issueNumber;
  return Object.freeze({
    ...(number > 0 ? {
      target: Object.freeze({
        kind: pullRequest ? 'pull-request' as const : 'issue' as const,
        number,
        labels: Object.freeze([...(pullRequest
          ? source.labels.currentPullRequestLabels ?? []
          : source.labels.currentIssueLabels ?? [])]),
      }),
    } : {}),
    activityLabel: source.labels.lifecycle.aiProcessing,
  });
}

function commitTheme(source: PushSingleActionContextSource): { kind: CommitNotificationContext['theme']; images: readonly string[] } {
  if (source.release.active) return { kind: 'release', images: source.images.commitReleaseGifs };
  if (source.hotfix.active) return { kind: 'hotfix', images: source.images.commitHotfixGifs };
  if (source.isBugfix) return { kind: 'bugfix', images: source.images.commitBugfixGifs };
  if (source.isFeature) return { kind: 'feature', images: source.images.commitFeatureGifs };
  if (source.isDocs) return { kind: 'docs', images: source.images.commitDocsGifs };
  if (source.isChore) return { kind: 'chore', images: source.images.commitChoreGifs };
  return { kind: 'automatic', images: source.images.commitAutomaticActions };
}

function copyInitialLabels(source: PushSingleActionContextSource['labels']): InitialLabelConfiguration {
  const keys = [
    'branchManagementLauncherLabel',
    'bug', 'bugfix', 'hotfix', 'enhancement', 'feature', 'release',
    'question', 'help', 'deploy', 'deployed', 'docs', 'documentation',
    'chore', 'maintenance', 'priorityHigh', 'priorityMedium', 'priorityLow',
    'priorityNone', 'sizeXxl', 'sizeXl', 'sizeL', 'sizeM', 'sizeS', 'sizeXs',
  ] as const;
  return Object.freeze({
    ...Object.fromEntries(keys.map(key => [key, source[key]])),
    lifecycle: Object.freeze({ ...source.lifecycle }),
  }) as InitialLabelConfiguration;
}

function copyDeploymentOperation(operation: DeploymentOperationSnapshot): DeploymentOperationSnapshot {
  return Object.freeze({
    ...operation,
    ...(operation.locale ? { locale: Object.freeze({ ...operation.locale }) } : {}),
    reconciliationTargets: Object.freeze((operation.reconciliationTargets ?? []).map(target => Object.freeze({ ...target }))),
    ...(operation.publicationReceipt ? { publicationReceipt: Object.freeze({ ...operation.publicationReceipt }) } : {}),
    ...(operation.lastFailure ? { lastFailure: Object.freeze({ ...operation.lastFailure }) } : {}),
  });
}

function asObject<T>(value: unknown): T | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as T : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function deepFreezeCopy<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) return Object.freeze(value.map(item => deepFreezeCopy(item))) as unknown as Readonly<T>;
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, deepFreezeCopy(nested)]),
    )) as Readonly<T>;
  }
  return value;
}
