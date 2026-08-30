import { Emoji } from '../data/model/emoji';
import { Issue } from '../data/model/issue';
import { Images } from '../data/model/images';
import { IssueTypes } from '../data/model/issue_types';
import { Labels } from '../data/model/labels';
import { Locale } from '../data/model/locale';
import { PullRequest } from '../data/model/pull_request';
import { Projects } from '../data/model/projects';
import { ProjectDetail } from '../data/model/project_detail';
import { Tokens } from '../data/model/tokens';
import { Workflows } from '../data/model/workflows';
import type { ExecutionInputs } from '../data/model/execution_inputs';
import type { CopilotLifecycleLabels } from '../domain/copilot_lifecycle';

export interface ImageScopeValues {
    automatic: string[];
    feature: string[];
    bugfix: string[];
    release: string[];
    hotfix: string[];
    docs: string[];
    chore: string[];
}

export interface ImageConfigurationValues {
    onIssue: boolean;
    onPullRequest: boolean;
    onCommit: boolean;
    issue: ImageScopeValues;
    pullRequest: ImageScopeValues;
    commit: ImageScopeValues;
}

export interface LabelValues {
    branching: { launcher: string };
    workflow: { bug: string; bugfix: string; hotfix: string; enhancement: string; feature: string; release: string; question: string; help: string; deploy: string; deployed: string; docs: string; documentation: string; chore: string; maintenance: string };
    priorities: { high: string; medium: string; low: string; none: string };
    sizes: { xxl: string; xl: string; l: string; m: string; s: string; xs: string };
    lifecycle?: Partial<CopilotLifecycleLabels>;
}

export interface IssueTypeDefinition {
    name: string;
    description: string;
    color: string;
}

export type IssueTypeConfigurationValues = Record<'task' | 'bug' | 'feature' | 'documentation' | 'maintenance' | 'hotfix' | 'release' | 'question' | 'help', IssueTypeDefinition>;

export interface ProjectConfigurationValues {
    projects: ProjectDetail[];
    issueCreated: string;
    pullRequestCreated: string;
    issueInProgress: string;
    pullRequestInProgress: string;
}

export function buildProjects(values: ProjectConfigurationValues): Projects {
    return new Projects(
        values.projects,
        values.issueCreated,
        values.pullRequestCreated,
        values.issueInProgress,
        values.pullRequestInProgress,
    );
}

export function buildWorkflows(release: string, hotfix: string): Workflows {
    return new Workflows(release, hotfix);
}

export function buildLocale(issue: string, pullRequest: string): Locale {
    return new Locale(issue, pullRequest);
}

export function buildIssue(branchManagementAlways: boolean, reopenOnPush: boolean, desiredAssigneesCount: number, inputs?: ExecutionInputs): Issue {
    return new Issue(branchManagementAlways, reopenOnPush, desiredAssigneesCount, inputs);
}

export function buildPullRequest(desiredAssigneesCount: number, desiredReviewersCount: number, mergeTimeout: number, inputs?: ExecutionInputs): PullRequest {
    return new PullRequest(desiredAssigneesCount, desiredReviewersCount, mergeTimeout, inputs);
}

export function buildEmoji(emojiLabeledTitle: boolean, branchManagementEmoji: string): Emoji {
    return new Emoji(emojiLabeledTitle, branchManagementEmoji);
}

export function buildTokens(token: string): Tokens {
    return new Tokens(token);
}

export function buildLabels(values: LabelValues): Labels {
    return new Labels(
        values.branching.launcher,
        values.workflow.bug,
        values.workflow.bugfix,
        values.workflow.hotfix,
        values.workflow.enhancement,
        values.workflow.feature,
        values.workflow.release,
        values.workflow.question,
        values.workflow.help,
        values.workflow.deploy,
        values.workflow.deployed,
        values.workflow.docs,
        values.workflow.documentation,
        values.workflow.chore,
        values.workflow.maintenance,
        values.priorities.high,
        values.priorities.medium,
        values.priorities.low,
        values.priorities.none,
        values.sizes.xxl,
        values.sizes.xl,
        values.sizes.l,
        values.sizes.m,
        values.sizes.s,
        values.sizes.xs,
        values.lifecycle,
    );
}

export function buildIssueTypes(values: IssueTypeConfigurationValues): IssueTypes {
    return new IssueTypes(
        values.task.name, values.task.description, values.task.color,
        values.bug.name, values.bug.description, values.bug.color,
        values.feature.name, values.feature.description, values.feature.color,
        values.documentation.name, values.documentation.description, values.documentation.color,
        values.maintenance.name, values.maintenance.description, values.maintenance.color,
        values.hotfix.name, values.hotfix.description, values.hotfix.color,
        values.release.name, values.release.description, values.release.color,
        values.question.name, values.question.description, values.question.color,
        values.help.name, values.help.description, values.help.color,
    );
}

export function buildImages(values: ImageConfigurationValues): Images {
    return new Images(
        values.onIssue,
        values.onPullRequest,
        values.onCommit,
        values.issue.automatic,
        values.issue.feature,
        values.issue.bugfix,
        values.issue.docs,
        values.issue.chore,
        values.issue.release,
        values.issue.hotfix,
        values.pullRequest.automatic,
        values.pullRequest.feature,
        values.pullRequest.bugfix,
        values.pullRequest.release,
        values.pullRequest.hotfix,
        values.pullRequest.docs,
        values.pullRequest.chore,
        values.commit.automatic,
        values.commit.feature,
        values.commit.bugfix,
        values.commit.release,
        values.commit.hotfix,
        values.commit.docs,
        values.commit.chore,
    );
}
