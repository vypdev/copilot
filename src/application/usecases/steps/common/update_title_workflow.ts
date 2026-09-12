import { Result } from '../../../../data/model/result';
import type {
    BoundIssueTitlePort,
    TitleLabelFacts,
} from '../../../../application/ports/issue_title_ports';
import { toApplicationError } from '../../../errors/application_error';

export type UpdateTitleContext =
    | {
        readonly kind: 'issue';
        readonly enabled: boolean;
        readonly issueNumber: number;
        readonly fallbackTitle: string;
        readonly version: string;
        readonly branchManagementAlways: boolean;
        readonly branchManagementEmoji: string;
        readonly labelFacts: TitleLabelFacts;
    }
    | {
        readonly kind: 'pull-request';
        readonly enabled: boolean;
        readonly issueNumber: number;
        readonly pullRequestNumber: number;
        readonly pullRequestTitle: string;
        readonly labelFacts: TitleLabelFacts;
    }
    | { readonly kind: 'unsupported' };

export interface UpdateTitleContextSource {
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly issueNumber: number;
    readonly issue: {
        readonly number: number;
        readonly title: string;
        readonly branchManagementAlways: boolean;
    };
    readonly pullRequest: { readonly number: number; readonly title: string };
    readonly emoji: { readonly emojiLabeledTitle: boolean; readonly branchManagementEmoji: string };
    readonly release: { readonly active: boolean; readonly version?: string };
    readonly hotfix: { readonly active: boolean; readonly version?: string };
    readonly labels: TitleLabelFacts;
}

export function projectUpdateTitleContext(source: UpdateTitleContextSource): UpdateTitleContext {
    if (source.isIssue) {
        return Object.freeze({
            kind: 'issue',
            enabled: source.emoji.emojiLabeledTitle,
            issueNumber: source.issue.number,
            fallbackTitle: source.issue.title,
            version: source.release.active
                ? source.release.version ?? ''
                : source.hotfix.active
                    ? source.hotfix.version ?? ''
                    : '',
            branchManagementAlways: source.issue.branchManagementAlways,
            branchManagementEmoji: source.emoji.branchManagementEmoji,
            labelFacts: projectTitleLabelFacts(source.labels),
        });
    }
    if (source.isPullRequest) {
        return Object.freeze({
            kind: 'pull-request',
            enabled: source.emoji.emojiLabeledTitle,
            issueNumber: source.issueNumber,
            pullRequestNumber: source.pullRequest.number,
            pullRequestTitle: source.pullRequest.title,
            labelFacts: projectTitleLabelFacts(source.labels),
        });
    }
    return Object.freeze({ kind: 'unsupported' });
}

export async function runIssueTitleUpdate(
    param: Extract<UpdateTitleContext, { kind: 'issue' }>,
    taskId: string,
    issueRepository: BoundIssueTitlePort,
): Promise<Result[]> {
    if (!param.enabled) return [skippedResult(taskId)];
    const currentTitle = await issueRepository.getTitle(param.issueNumber) ?? param.fallbackTitle;
    const title = await issueRepository.updateIssueTitle({
        version: param.version,
        currentTitle,
        issueNumber: param.issueNumber,
        branchManagementAlways: param.branchManagementAlways,
        branchManagementEmoji: param.branchManagementEmoji,
        labelFacts: param.labelFacts,
    });
    return title
        ? [updatedResult(taskId, `The issue's title was updated from \`${currentTitle}\` to \`${title}\`.`)]
        : [skippedResult(taskId)];
}

export async function runPullRequestTitleUpdate(
    param: Extract<UpdateTitleContext, { kind: 'pull-request' }>,
    taskId: string,
    issueRepository: BoundIssueTitlePort,
): Promise<Result[]> {
    if (!param.enabled) return [skippedResult(taskId)];
    const issueTitle = await issueRepository.getTitle(param.issueNumber);
    if (issueTitle === undefined) {
        return [new Result({ id: taskId, success: false, executed: true, steps: ['Tried to update title, but there was a problem.'] })];
    }
    const title = await issueRepository.updatePullRequestTitle({
        pullRequestTitle: param.pullRequestTitle,
        issueTitle,
        issueNumber: param.issueNumber,
        pullRequestNumber: param.pullRequestNumber,
        labelFacts: param.labelFacts,
    });
    return title
        ? [updatedResult(taskId, `The pull request's title was updated from \`${param.pullRequestTitle}\` to \`${title}\`.`)]
        : [skippedResult(taskId)];
}

export function titleUpdateFailure(taskId: string, error: unknown): Result {
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ['Tried to update title, but there was a problem.'],
        errors: [toApplicationError(error, 'provider.unavailable', 'Unable to update the title.')],
    });
}

function projectTitleLabelFacts(labels: TitleLabelFacts): TitleLabelFacts {
    return Object.freeze({
        isHotfix: labels.isHotfix,
        isRelease: labels.isRelease,
        isBugfix: labels.isBugfix,
        isBug: labels.isBug,
        isFeature: labels.isFeature,
        isEnhancement: labels.isEnhancement,
        isDocs: labels.isDocs,
        isDocumentation: labels.isDocumentation,
        isChore: labels.isChore,
        isMaintenance: labels.isMaintenance,
        isHelp: labels.isHelp,
        isQuestion: labels.isQuestion,
        containsBranchedLabel: labels.containsBranchedLabel,
    });
}

function updatedResult(taskId: string, step: string): Result {
    return new Result({ id: taskId, success: true, executed: true, steps: [step] });
}

function skippedResult(taskId: string): Result {
    return new Result({ id: taskId, success: true, executed: false });
}
