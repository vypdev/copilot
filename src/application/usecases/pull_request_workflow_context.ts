import type { AgentConfiguration } from '../../domain/agent';
import type { PullRequestDescriptionMode } from '../../domain/pull_request_description';
import type { AssignmentContext, CloseIssueAfterMergeContext, PrioritySizeContext } from './issue_workflow_context';
import { copyProjects, projectAssignmentContext } from './issue_workflow_context';

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
}

export interface SyncPullRequestLabelsContext {
  readonly issueNumber: number;
  readonly pullRequestNumber: number;
  readonly sizeLabels: readonly string[];
}

export interface PullRequestDescriptionContext {
  readonly eventName: string;
  readonly issueNumber: number;
  readonly pullRequest: {
    readonly number: number;
    readonly body: string;
    readonly headBranch: string;
    readonly baseBranch: string;
    readonly creator: string;
  };
  readonly mode: PullRequestDescriptionMode;
  readonly membersOnly: boolean;
  readonly agentConfiguration: Readonly<AgentConfiguration>;
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
    readonly base: string;
    readonly creator: string;
    readonly desiredAssigneesCount: number;
    readonly desiredReviewersCount: number;
  };
  readonly branches: { readonly defaultBranch: string };
  readonly labels: {
    readonly sizeLabels: readonly string[];
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
    linkIssue: Object.freeze({
      pullRequestNumber: source.pullRequest.number,
      issueNumber: source.issueNumber,
      originalBaseBranch: source.pullRequest.base,
      defaultBranch: source.branches.defaultBranch,
    }),
    syncLabels: Object.freeze({
      issueNumber: source.issueNumber,
      pullRequestNumber: source.pullRequest.number,
      sizeLabels: Object.freeze([...source.labels.sizeLabels]),
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
    closeIssue: Object.freeze({
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
      body: source.pullRequest.body,
      headBranch: source.pullRequest.head,
      baseBranch: source.pullRequest.base,
      creator: source.pullRequest.creator,
    }),
    mode: source.ai.getPullRequestDescriptionMode(),
    membersOnly: source.ai.getAiMembersOnly(),
    agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('planner') }),
  });
}
