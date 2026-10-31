import { pendingPullRequestParent } from '../../domain/pull_request_issue_link_state';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS, type CopilotLifecycleLabels } from '../../domain/copilot_lifecycle';
import type { AgentConfiguration } from '../../domain/agent';
import type { PullRequestDescriptionMode } from '../../domain/pull_request_description';
import type { AssignmentContext, CloseIssueAfterMergeContext, PrioritySizeContext } from './issue_workflow_context';
import { copyProjects, projectAssignmentContext } from './issue_workflow_context';
import type { ProjectReference } from '../ports/project_board_link_ports';

export interface AssignReviewersContext {
  readonly pullRequestNumber: number;
  readonly desiredReviewersCount: number;
  readonly creator: string;
}

export interface LinkPullRequestIssueContext {
  readonly pullRequestNumber: number;
  readonly issueNumber: number;
  readonly originalBaseBranch: string;
  readonly defaultBranch: string;
  readonly expectedHeadSha?: string;
  readonly expectedHeadRepository?: string;
  readonly expectedHeadRef?: string;
  readonly recoveryOnly?: boolean;
}

export interface SyncPullRequestLabelsContext {
  readonly issueNumber: number;
  readonly pullRequestNumber: number;
  readonly sizeLabels: readonly string[];
  readonly projects: readonly ProjectReference[];
  readonly projectSizeByLabel: Readonly<Record<string, string>>;
}

export interface PullRequestDescriptionContext {
  readonly eventName: string;
  readonly issueNumber: number;
  readonly pullRequest: {
    readonly number: number;
    readonly body: string;
    readonly headSha?: string;
    readonly headRepository?: string;
    readonly headBranch: string;
    readonly baseBranch: string;
    readonly creator: string;
  };
  readonly mode: PullRequestDescriptionMode;
  readonly membersOnly: boolean;
  readonly agentConfiguration: Readonly<AgentConfiguration>;
  readonly targetLocale: string;
}

export interface PullRequestDescriptionRequest {
  readonly context: PullRequestDescriptionContext;
  readonly trigger: 'automatic' | 'authorized-command';
}

export interface PullRequestWorkflowStepContexts {
  readonly assignment: AssignmentContext;
  readonly reviewers: AssignReviewersContext;
  readonly linkIssue: LinkPullRequestIssueContext;
  readonly syncLabels: SyncPullRequestLabelsContext;
  readonly priority: PrioritySizeContext;
  readonly description: PullRequestDescriptionContext;
  readonly closeIssue: CloseIssueAfterMergeContext;
  readonly retireBranchSync: import('./actions/retire_branch_sync_use_case').RetireBranchSyncContext;
}

interface ProjectSource {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly owner: string;
  readonly url: string;
  readonly publicUrl?: string;
  readonly number: number;
}

export interface PullRequestWorkflowContextSource {
  readonly pullRequestParentBranch?: string;
  readonly currentConfiguration?: { readonly parentBranch?: string; readonly workingBranch?: string };
  readonly tokenUser?: string;
  readonly isIssue: boolean;
  readonly isPullRequest: boolean;
  readonly eventName: string;
  readonly issueNumber: number;
  readonly issue: {
    readonly number: number;
    readonly creator: string;
    readonly desiredAssigneesCount: number;
  };
  readonly pullRequest: {
    readonly number: number;
    readonly body: string;
    readonly head: string;
    readonly headSha?: string;
    readonly headRepository?: string;
    readonly base: string;
    readonly creator: string;
    readonly desiredAssigneesCount: number;
    readonly desiredReviewersCount: number;
  };
  readonly branches: { readonly defaultBranch: string };
  readonly labels: {
    readonly sizeLabels: readonly string[];
    readonly sizeXxl?: string;
    readonly sizeXl?: string;
    readonly sizeL?: string;
    readonly sizeM?: string;
    readonly sizeS?: string;
    readonly sizeXs?: string;
    readonly lifecycle?: CopilotLifecycleLabels;
    readonly completionProtectedLabels?: readonly string[];
    readonly priorityLabelOnIssue?: string;
    readonly priorityLabelOnIssueProcessable: boolean;
    readonly priorityHigh: string;
    readonly priorityMedium: string;
    readonly priorityLow: string;
  };
  readonly project: { getProjects(): readonly ProjectSource[] };
  readonly ai: {
    getPullRequestDescriptionMode(): PullRequestDescriptionMode;
    getAiMembersOnly(): boolean;
    getAgentConfiguration(task: 'planner'): AgentConfiguration;
  };
  readonly locale: { readonly pullRequest: string; readonly issue?: string };
}

export function projectLinkPullRequestIssueContext(source: PullRequestWorkflowContextSource): LinkPullRequestIssueContext {
  return Object.freeze({
    pullRequestNumber: source.pullRequest.number,
    issueNumber: source.issueNumber,
    originalBaseBranch: pendingPullRequestParent(source.pullRequest.body ?? '', source.pullRequest.number, source.issueNumber)
      ?? source.pullRequestParentBranch ?? source.pullRequest.base,
    expectedHeadSha: source.pullRequest.headSha,
    expectedHeadRepository: source.pullRequest.headRepository,
    expectedHeadRef: source.pullRequest.head || source.currentConfiguration?.workingBranch,
    defaultBranch: source.branches.defaultBranch,
  });
}

export function projectPullRequestWorkflowStepContexts(
  source: PullRequestWorkflowContextSource,
): PullRequestWorkflowStepContexts {
  const projects = copyProjects(source.project.getProjects());
  return Object.freeze({
    assignment: projectAssignmentContext(source),
    reviewers: Object.freeze({
      pullRequestNumber: source.pullRequest.number,
      desiredReviewersCount: source.pullRequest.desiredReviewersCount,
      creator: source.pullRequest.creator,
    }),
    linkIssue: projectLinkPullRequestIssueContext(source),
    syncLabels: Object.freeze({
      issueNumber: source.issueNumber,
      pullRequestNumber: source.pullRequest.number,
      sizeLabels: Object.freeze([...source.labels.sizeLabels]),
      projects,
      projectSizeByLabel: Object.freeze(Object.fromEntries([
        [source.labels.sizeXxl, 'XL'], [source.labels.sizeXl, 'XL'],
        [source.labels.sizeL, 'L'], [source.labels.sizeM, 'M'],
        [source.labels.sizeS, 'S'], [source.labels.sizeXs, 'XS'],
      ].filter(([label]) => typeof label === 'string' && label.length > 0))),
    }),
    priority: Object.freeze({
      contentNumber: source.pullRequest.number,
      priority: Object.freeze({
        ...(source.labels.priorityLabelOnIssue ? { currentLabel: source.labels.priorityLabelOnIssue } : {}),
        processable: source.labels.priorityLabelOnIssueProcessable,
        high: source.labels.priorityHigh,
        medium: source.labels.priorityMedium,
        low: source.labels.priorityLow,
      }),
      projects,
    }),
    description: projectPullRequestDescriptionContext(source),
    retireBranchSync: Object.freeze({ issueNumber: source.issueNumber, locale: source.locale.issue ?? 'en-US', trustedBotLogin: source.tokenUser }),
    closeIssue: Object.freeze({
      completionLabels: Object.freeze({
        lifecycle: Object.freeze({ ...(source.labels.lifecycle ?? DEFAULT_COPILOT_LIFECYCLE_LABELS) }),
        protectedLabels: Object.freeze([...(source.labels.completionProtectedLabels ?? ['branched', 'SDD', 'contract-change'])]),
      }),
      issueNumber: source.issueNumber,
      pullRequestNumber: source.pullRequest.number,
    }),
  });
}

export function projectPullRequestDescriptionContext(
  source: PullRequestWorkflowContextSource,
): PullRequestDescriptionContext {
  return Object.freeze({
    eventName: source.eventName,
    issueNumber: source.issueNumber,
    pullRequest: Object.freeze({
      number: source.pullRequest.number > 0 ? source.pullRequest.number : source.issue.number,
      body: source.pullRequest.body ?? '',
      headBranch: source.pullRequest.head,
      headSha: source.pullRequest.headSha,
      headRepository: source.pullRequest.headRepository,
      baseBranch: pendingPullRequestParent(source.pullRequest.body ?? '', source.pullRequest.number, source.issueNumber) ?? source.pullRequestParentBranch ?? source.pullRequest.base,
      creator: source.pullRequest.creator,
    }),
    mode: source.ai.getPullRequestDescriptionMode(),
    membersOnly: source.ai.getAiMembersOnly(),
    agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('planner') }),
    targetLocale: source.locale.pullRequest,
  });
}
