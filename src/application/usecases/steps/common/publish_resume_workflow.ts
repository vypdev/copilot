import { Result } from '../../../../data/model/result';
import type { BoundIssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import type { ApplicationLogReportReaderPort } from '../../../ports/logging_ports';
import { getRandomElement } from '../../../../utils/list_utils';
import { logError } from '../../../ports/logging_ports';
import {
    buildDebugLogSection,
    hasPublishableContent,
    renderResultSections,
    resolveResultPublicationIssueNumber,
    resolveResultPublicationPresentation,
} from '../../../policies/result_publication_policy';
import type {
    ResultPublicationContext,
    ResultPublicationImages,
    ResultPublicationRecord,
    ResultPublicationTargetInput,
} from '../../../policies/result_publication_contracts';
import { buildApplicationErrorPresentation } from '../../../policies/application_error_presentation_policy';
import { toApplicationError } from '../../../errors/application_error';

export interface PublishResultContext {
    readonly skipBugbotReviewSummary: boolean;
    readonly debug: boolean;
    readonly target: ResultPublicationTargetInput;
    readonly presentation: ResultPublicationContext;
    readonly results: readonly ResultPublicationRecord[];
}

export interface PublishResultContextSource {
    readonly debug: boolean;
    readonly isSingleAction: boolean;
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly isPush: boolean;
    readonly issueNumber: number;
    readonly issueNotBranched: boolean;
    readonly isBugfix: boolean;
    readonly isFeature: boolean;
    readonly isDocs: boolean;
    readonly isChore: boolean;
    readonly singleAction: { readonly issue: number };
    readonly issue: { readonly number: number };
    readonly pullRequest: { readonly number: number };
    readonly release: { readonly active: boolean };
    readonly hotfix: { readonly active: boolean };
    readonly images: ResultPublicationImages;
    readonly currentConfiguration: {
        readonly results: readonly Result[];
    };
}

export function projectPublishResultContext(source: PublishResultContextSource): PublishResultContext {
    const results = Object.freeze(source.currentConfiguration.results.map(projectResult));
    return Object.freeze({
        skipBugbotReviewSummary: source.isPullRequest
            && !source.isSingleAction
            && results.some((result) => result.id === 'DetectPotentialProblemsUseCase' && result.executed),
        debug: source.debug,
        target: Object.freeze({
            isSingleAction: source.isSingleAction,
            singleActionIssue: source.singleAction.issue,
            isIssue: source.isIssue,
            issueNumber: source.issue.number,
            isPullRequest: source.isPullRequest,
            pullRequestNumber: source.pullRequest.number,
            isPush: source.isPush,
            pushIssueNumber: source.issueNumber,
        }),
        presentation: Object.freeze({
            isIssue: source.isIssue,
            isPullRequest: source.isPullRequest,
            issueNotBranched: source.issueNotBranched,
            releaseActive: source.release.active,
            hotfixActive: source.hotfix.active,
            isBugfix: source.isBugfix,
            isFeature: source.isFeature,
            isDocs: source.isDocs,
            isChore: source.isChore,
            images: projectImages(source.images),
        }),
        results,
    });
}

export async function runPublishResume(
    param: PublishResultContext,
    taskId: string,
    issueNotificationPort: BoundIssueNotificationPort,
    logReport: ApplicationLogReportReaderPort,
): Promise<Result | undefined> {
    try {
        if (param.skipBugbotReviewSummary) return undefined;
        const sections = renderResultSections(param.results);
        const debugLogSection = buildDebugLogSection(param.debug, logReport.getAccumulatedLogsAsText());
        if (!hasPublishableContent(sections, debugLogSection)) return undefined;
        const issueNumber = resolveResultPublicationIssueNumber(param.target);
        if (issueNumber === undefined) return undefined;
        await issueNotificationPort.addComment(
            issueNumber,
            buildResumeComment(param, sections, debugLogSection),
        );
        return undefined;
    } catch (error) {
        const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to publish the workflow summary.');
        logError(semanticError);
        return new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['Tried to publish the resume, but there was a problem.'],
            errors: [semanticError],
        });
    }
}

function buildResumeComment(
    param: PublishResultContext,
    sections: ReturnType<typeof renderResultSections>,
    debugLogSection: string,
): string {
    const presentation = resolveResultPublicationPresentation(
        param.presentation,
        (images) => getRandomElement([...images]),
    );
    const imageMarkdown = shouldRenderImage(param.presentation, presentation.image)
        ? `![image](${presentation.image})`
        : '';
    return `# ${presentation.title}
${sections.content}
${sections.errors}

${imageMarkdown}

${sections.footer}
${debugLogSection}
🚀 Happy coding!
            `;
}

function shouldRenderImage(
    context: ResultPublicationContext,
    image: string | undefined,
): image is string {
    if (!image) return false;
    return context.isIssue
        ? context.images.imagesOnIssue
        : context.images.imagesOnPullRequest;
}

function projectResult(result: Result): ResultPublicationRecord {
    return Object.freeze({
        id: result.id,
        executed: result.executed,
        steps: Object.freeze([...result.steps]),
        reminders: Object.freeze([...result.reminders]),
        errors: Object.freeze(result.errors.map((error) => Object.freeze(buildApplicationErrorPresentation(error)))),
        stepFormat: result.stepFormat,
    });
}

function projectImages(images: ResultPublicationImages): ResultPublicationImages {
    return Object.freeze({
        imagesOnIssue: images.imagesOnIssue,
        issueAutomaticActions: Object.freeze([...images.issueAutomaticActions]),
        issueFeatureGifs: Object.freeze([...images.issueFeatureGifs]),
        issueBugfixGifs: Object.freeze([...images.issueBugfixGifs]),
        issueReleaseGifs: Object.freeze([...images.issueReleaseGifs]),
        issueHotfixGifs: Object.freeze([...images.issueHotfixGifs]),
        issueDocsGifs: Object.freeze([...images.issueDocsGifs]),
        issueChoreGifs: Object.freeze([...images.issueChoreGifs]),
        imagesOnPullRequest: images.imagesOnPullRequest,
        pullRequestAutomaticActions: Object.freeze([...images.pullRequestAutomaticActions]),
        pullRequestFeatureGifs: Object.freeze([...images.pullRequestFeatureGifs]),
        pullRequestBugfixGifs: Object.freeze([...images.pullRequestBugfixGifs]),
        pullRequestReleaseGifs: Object.freeze([...images.pullRequestReleaseGifs]),
        pullRequestHotfixGifs: Object.freeze([...images.pullRequestHotfixGifs]),
        pullRequestDocsGifs: Object.freeze([...images.pullRequestDocsGifs]),
        pullRequestChoreGifs: Object.freeze([...images.pullRequestChoreGifs]),
    });
}
