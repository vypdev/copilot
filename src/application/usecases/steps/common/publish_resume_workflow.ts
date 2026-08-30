import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
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

export async function runPublishResume(
    param: Execution,
    taskId: string,
    issueNotificationPort: IssueNotificationPort,
    logReport: ApplicationLogReportReaderPort,
): Promise<void> {
    try {
        const sections = renderResultSections(param.currentConfiguration.results);
        const debugLogSection = buildDebugLogSection(param.debug, logReport.getAccumulatedLogsAsText());
        if (!hasPublishableContent(sections, debugLogSection)) return;
        const issueNumber = resolveResultPublicationIssueNumber({
            isSingleAction: param.isSingleAction,
            singleActionIssue: param.singleAction.issue,
            isIssue: param.isIssue,
            issueNumber: param.issue.number,
            isPullRequest: param.isPullRequest,
            pullRequestNumber: param.pullRequest.number,
            isPush: param.isPush,
            pushIssueNumber: param.issueNumber,
        });
        if (issueNumber === undefined) return;
        await issueNotificationPort.addComment(
            param.owner,
            param.repo,
            issueNumber,
            buildResumeComment(param, sections, debugLogSection),
            param.tokens.token,
        );
    } catch (error) {
        logError(error);
        param.currentConfiguration.results.push(new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['Tried to publish the resume, but there was a problem.'],
            errors: [error],
        }));
    }
}

function buildResumeComment(
    param: Execution,
    sections: ReturnType<typeof renderResultSections>,
    debugLogSection: string,
): string {
    const presentation = resolveResultPublicationPresentation({
        isIssue: param.isIssue,
        isPullRequest: param.isPullRequest,
        issueNotBranched: param.issueNotBranched,
        releaseActive: param.release.active,
        hotfixActive: param.hotfix.active,
        isBugfix: param.isBugfix,
        isFeature: param.isFeature,
        isDocs: param.isDocs,
        isChore: param.isChore,
        images: param.images,
    }, getRandomElement);
    const imageMarkdown = presentation.image && ((param.isIssue && param.images.imagesOnIssue) || (param.isPullRequest && param.images.imagesOnPullRequest))
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
