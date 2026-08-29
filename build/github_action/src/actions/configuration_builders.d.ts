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
    branching: {
        launcher: string;
    };
    workflow: {
        bug: string;
        bugfix: string;
        hotfix: string;
        enhancement: string;
        feature: string;
        release: string;
        question: string;
        help: string;
        deploy: string;
        deployed: string;
        docs: string;
        documentation: string;
        chore: string;
        maintenance: string;
    };
    priorities: {
        high: string;
        medium: string;
        low: string;
        none: string;
    };
    sizes: {
        xxl: string;
        xl: string;
        l: string;
        m: string;
        s: string;
        xs: string;
    };
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
export declare function buildProjects(values: ProjectConfigurationValues): Projects;
export declare function buildWorkflows(release: string, hotfix: string): Workflows;
export declare function buildLocale(issue: string, pullRequest: string): Locale;
export declare function buildIssue(branchManagementAlways: boolean, reopenOnPush: boolean, desiredAssigneesCount: number, inputs?: ExecutionInputs): Issue;
export declare function buildPullRequest(desiredAssigneesCount: number, desiredReviewersCount: number, mergeTimeout: number, inputs?: ExecutionInputs): PullRequest;
export declare function buildEmoji(emojiLabeledTitle: boolean, branchManagementEmoji: string): Emoji;
export declare function buildTokens(token: string): Tokens;
export declare function buildLabels(values: LabelValues): Labels;
export declare function buildIssueTypes(values: IssueTypeConfigurationValues): IssueTypes;
export declare function buildImages(values: ImageConfigurationValues): Images;
