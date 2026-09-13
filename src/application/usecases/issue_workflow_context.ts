import type { AgentConfiguration } from '../../domain/agent';
import type { ProjectReference } from '../ports/project_board_link_ports';
import type { SelectedIssueType } from '../ports/issue_management_ports';
import type { Result } from '../../data/model/result';

export interface AssignmentContext {
  readonly target: 'issue' | 'pull request';
  readonly number: number;
  readonly desiredAssigneesCount: number;
  readonly creator: string;
}

export interface IssueNumberContext {
  readonly issueNumber: number;
}

export interface CloseIssueAfterMergeContext extends IssueNumberContext {
  readonly pullRequestNumber: number;
}

export interface UpdateIssueTypeContext extends IssueNumberContext {
  readonly issueType: SelectedIssueType;
}

export interface MoveIssueToInProgressContext extends IssueNumberContext {
  readonly columnName: string;
  readonly projects: readonly ProjectReference[];
}

export interface PrioritySizeContext {
  readonly contentNumber: number;
  readonly priority: {
    readonly currentLabel?: string;
    readonly processable: boolean;
    readonly high: string;
    readonly medium: string;
    readonly low: string;
  };
  readonly projects: readonly ProjectReference[];
}

export interface RemoveIssueBranchesContext extends IssueNumberContext {
  readonly managedBranchTypes: readonly string[];
  readonly previousBranchType?: string;
  readonly hotfixBranchType: string;
}

export interface RemoveObsoleteIssueBranchesContext extends IssueNumberContext {
  readonly issueTitle: string;
  readonly managementBranch: string;
  readonly managedBranchTypes: readonly string[];
}

export interface BranchConfigurationPatch {
  readonly parentBranch?: string;
  readonly workingBranch?: string;
  readonly releaseBranch?: string;
  readonly releaseOriginBranch?: string;
  readonly releaseOriginSha?: string;
  readonly hotfixBranch?: string;
  readonly hotfixOriginSha?: string;
}

export interface BranchPreparationOutcome {
  readonly results: readonly Result[];
  readonly configurationPatch: BranchConfigurationPatch;
}

export function branchPreparationOutcome(
  results: readonly Result[],
  configurationPatch: BranchConfigurationPatch = {},
): BranchPreparationOutcome {
  return Object.freeze({
    results: Object.freeze([...results]),
    configurationPatch: Object.freeze({ ...configurationPatch }),
  });
}

export interface BranchPreparationContext extends IssueNumberContext {
  readonly issueTitle: string;
  readonly mandatoryBranchRequired: boolean;
  readonly managementBranch: string;
  readonly repositoryWebUrl: string;
  readonly branches: {
    readonly main: string;
    readonly defaultBranch: string;
    readonly development: string;
    readonly managedTypes: readonly string[];
  };
  readonly currentConfiguration: {
    readonly parentBranch?: string;
  };
  readonly release: {
    readonly active: boolean;
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
  readonly commitPrefixBuilder: string;
  readonly deployLabel: string;
  readonly releaseWorkflow: string;
  readonly moveToInProgress: MoveIssueToInProgressContext;
}

export interface DeployAddedContext {
  readonly issue: {
    readonly labeled: boolean;
    readonly labelAdded: string;
    readonly number: number;
    readonly title: string;
    readonly body: string;
  };
  readonly deployLabel: string;
  readonly release: { readonly active: boolean; readonly branch?: string; readonly version?: string };
  readonly hotfix: { readonly active: boolean; readonly branch?: string; readonly version?: string };
  readonly workflows: { readonly release: string; readonly hotfix: string };
  readonly repositoryWebUrl: string;
  readonly moveToInProgress: MoveIssueToInProgressContext;
}

export interface AnswerIssueHelpContext extends IssueNumberContext {
  readonly opened: boolean;
  readonly questionOrHelp: boolean;
  readonly description: string;
  readonly agentConfiguration: Readonly<AgentConfiguration>;
  readonly newIssue: boolean;
  readonly tokenUser?: string;
}

export interface IssueWorkflowStepContexts {
  readonly closeNotAllowed: IssueNumberContext;
  readonly assignment: AssignmentContext;
  readonly issueType: UpdateIssueTypeContext;
  readonly priority: PrioritySizeContext;
  readonly removeIssueBranches: RemoveIssueBranchesContext;
  readonly prepareBranches: BranchPreparationContext;
  readonly removeObsoleteBranches: RemoveObsoleteIssueBranchesContext;
  readonly deployAdded: DeployAddedContext;
  readonly answerHelp: AnswerIssueHelpContext;
}

interface ProjectSource extends ProjectReference {
  readonly publicUrl?: string;
}

export interface IssueWorkflowContextSource {
  readonly owner: string;
  readonly repo: string;
  readonly issueNumber: number;
  readonly isIssue: boolean;
  readonly isPullRequest: boolean;
  readonly eventName: string;
  readonly tokenUser?: string;
  readonly managementBranch: string;
  readonly issue: {
    readonly number: number;
    readonly title: string;
    readonly body: string;
    readonly creator: string;
    readonly opened: boolean;
    readonly labeled: boolean;
    readonly labelAdded: string;
    readonly desiredAssigneesCount: number;
  };
  readonly pullRequest: {
    readonly number: number;
    readonly creator: string;
    readonly desiredAssigneesCount: number;
  };
  readonly labels: {
    readonly isMandatoryBranchedLabel: boolean;
    readonly isQuestion: boolean;
    readonly isHelp: boolean;
    readonly isHotfix: boolean;
    readonly isRelease: boolean;
    readonly isDocs: boolean;
    readonly isDocumentation: boolean;
    readonly isChore: boolean;
    readonly isMaintenance: boolean;
    readonly isBugfix: boolean;
    readonly isBug: boolean;
    readonly isFeature: boolean;
    readonly isEnhancement: boolean;
    readonly priorityLabelOnIssue?: string;
    readonly priorityLabelOnIssueProcessable: boolean;
    readonly priorityHigh: string;
    readonly priorityMedium: string;
    readonly priorityLow: string;
    readonly feature: string;
    readonly bugfix: string;
    readonly deploy: string;
  };
  readonly issueTypes: Readonly<Record<IssueTypeKey, string>>;
  readonly branches: {
    readonly main: string;
    readonly defaultBranch: string;
    readonly development: string;
    readonly featureTree: string;
    readonly bugfixTree: string;
    readonly docsTree: string;
    readonly choreTree: string;
    readonly hotfixTree: string;
  };
  readonly previousConfiguration?: { readonly branchType?: string };
  readonly currentConfiguration: { readonly parentBranch?: string };
  readonly release: { readonly active: boolean; readonly version?: string; readonly branch?: string };
  readonly hotfix: {
    readonly active: boolean;
    readonly baseVersion?: string;
    readonly version?: string;
    readonly baseBranch?: string;
    readonly branch?: string;
  };
  readonly commitPrefixBuilder: string;
  readonly workflows: { readonly release: string; readonly hotfix: string };
  readonly project: {
    getProjects(): readonly ProjectSource[];
    getProjectColumnIssueInProgress(): string;
  };
  readonly ai: { getAgentConfiguration(task: 'planner'): AgentConfiguration };
  readonly inputs?: { readonly action?: string };
}

type IssueTypeName = 'task' | 'bug' | 'feature' | 'documentation' | 'maintenance' | 'hotfix' | 'release' | 'question' | 'help';
type IssueTypeKey = IssueTypeName | `${IssueTypeName}Description` | `${IssueTypeName}Color`;

export function projectIssueWorkflowStepContexts(source: IssueWorkflowContextSource): IssueWorkflowStepContexts {
  const projects = copyProjects(source.project.getProjects());
  const moveToInProgress = Object.freeze({
    issueNumber: source.issueNumber,
    columnName: source.project.getProjectColumnIssueInProgress(),
    projects,
  });
  const managedBranchTypes = Object.freeze([
    source.branches.featureTree,
    source.branches.bugfixTree,
  ]);
  const branchPreparationTypes = Object.freeze([
    source.branches.featureTree,
    source.branches.bugfixTree,
    source.branches.docsTree,
    source.branches.choreTree,
  ].filter((value) => value.length > 0));
  const repositoryWebUrl = `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}`;

  return Object.freeze({
    closeNotAllowed: Object.freeze({ issueNumber: source.issueNumber }),
    assignment: projectAssignmentContext(source),
    issueType: Object.freeze({
      issueNumber: source.issueNumber,
      issueType: Object.freeze(selectIssueType(source)),
    }),
    priority: Object.freeze({
      contentNumber: source.issueNumber,
      priority: Object.freeze({
        ...(source.labels.priorityLabelOnIssue ? { currentLabel: source.labels.priorityLabelOnIssue } : {}),
        processable: source.labels.priorityLabelOnIssueProcessable,
        high: source.labels.priorityHigh,
        medium: source.labels.priorityMedium,
        low: source.labels.priorityLow,
      }),
      projects,
    }),
    removeIssueBranches: Object.freeze({
      issueNumber: source.issueNumber,
      managedBranchTypes,
      ...(source.previousConfiguration?.branchType
        ? { previousBranchType: source.previousConfiguration.branchType }
        : {}),
      hotfixBranchType: source.branches.hotfixTree,
    }),
    prepareBranches: Object.freeze({
      issueNumber: source.issueNumber,
      issueTitle: source.issue.title ?? '',
      mandatoryBranchRequired: source.labels.isMandatoryBranchedLabel,
      managementBranch: source.managementBranch,
      repositoryWebUrl,
      branches: Object.freeze({
        main: source.branches.main,
        defaultBranch: source.branches.defaultBranch,
        development: source.branches.development,
        managedTypes: branchPreparationTypes,
      }),
      currentConfiguration: Object.freeze({
        ...(source.currentConfiguration.parentBranch
          ? { parentBranch: source.currentConfiguration.parentBranch }
          : {}),
      }),
      release: Object.freeze({ ...source.release }),
      hotfix: Object.freeze({ ...source.hotfix }),
      commitPrefixBuilder: source.commitPrefixBuilder,
      deployLabel: source.labels.deploy,
      releaseWorkflow: source.workflows.release,
      moveToInProgress,
    }),
    removeObsoleteBranches: Object.freeze({
      issueNumber: source.issueNumber,
      issueTitle: source.issue.title ?? '',
      managementBranch: source.managementBranch,
      managedBranchTypes,
    }),
    deployAdded: Object.freeze({
      issue: Object.freeze({
        labeled: source.issue.labeled,
        labelAdded: source.issue.labelAdded,
        number: source.issue.number,
        title: source.issue.title,
        body: source.issue.body,
      }),
      deployLabel: source.labels.deploy,
      release: Object.freeze({ ...source.release }),
      hotfix: Object.freeze({ ...source.hotfix }),
      workflows: Object.freeze({ ...source.workflows }),
      repositoryWebUrl,
      moveToInProgress,
    }),
    answerHelp: Object.freeze({
      issueNumber: source.issue.number,
      opened: source.issue.opened,
      questionOrHelp: source.labels.isQuestion || source.labels.isHelp,
      description: (source.issue.body ?? '').trim(),
      agentConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('planner') }),
      newIssue: source.eventName === 'issues' && source.inputs?.action === 'opened',
      ...(source.tokenUser?.trim() ? { tokenUser: source.tokenUser.trim() } : {}),
    }),
  });
}

export function projectAssignmentContext(source: {
  readonly isIssue: boolean;
  readonly issue: { readonly number: number; readonly desiredAssigneesCount: number; readonly creator: string };
  readonly pullRequest: { readonly number: number; readonly desiredAssigneesCount: number; readonly creator: string };
}): AssignmentContext {
  const target = source.isIssue ? source.issue : source.pullRequest;
  return Object.freeze({
    target: source.isIssue ? 'issue' : 'pull request',
    number: target.number,
    desiredAssigneesCount: target.desiredAssigneesCount,
    creator: target.creator,
  });
}

export function copyProjects(projects: readonly ProjectSource[]): readonly ProjectReference[] {
  return Object.freeze(projects.map((project) => Object.freeze({
    id: project.id,
    title: project.title,
    type: project.type,
    owner: project.owner,
    url: project.publicUrl || project.url,
    number: project.number,
  })));
}

function selectIssueType(source: IssueWorkflowContextSource): SelectedIssueType {
  const name: IssueTypeName = source.labels.isHotfix ? 'hotfix'
    : source.labels.isRelease ? 'release'
      : source.labels.isDocs || source.labels.isDocumentation ? 'documentation'
        : source.labels.isChore || source.labels.isMaintenance ? 'maintenance'
          : source.labels.isBugfix || source.labels.isBug ? 'bug'
            : source.labels.isFeature || source.labels.isEnhancement ? 'feature'
              : source.labels.isHelp ? 'help'
                : source.labels.isQuestion ? 'question'
                  : 'task';
  return {
    name: source.issueTypes[name],
    description: source.issueTypes[`${name}Description`],
    color: source.issueTypes[`${name}Color`],
  };
}
