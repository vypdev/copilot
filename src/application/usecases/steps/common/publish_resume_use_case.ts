import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueNotificationPort } from "../../../ports/issue_lifecycle_ports";
import type { ApplicationLogReportReaderPort } from "../../../ports/logging_ports";
import { getRandomElement } from "../../../../utils/list_utils";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import {
    buildDebugLogSection,
    hasPublishableContent,
    renderResultSections,
    resolveResultPublicationIssueNumber,
    resolveResultPublicationPresentation,
} from "../../../policies/result_publication_policy";
import { ParamUseCase } from "../../base/param_usecase";

/**
 * Publish the resume of actions
 */
export class PublishResultUseCase implements ParamUseCase<Execution, void> {
    taskId: string = 'PublishResultUseCase';
    constructor(
        private readonly issueNotificationPort: IssueNotificationPort,
        private readonly logReport: ApplicationLogReportReaderPort,
    ) {}

    async invoke(param: Execution): Promise<void> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        try {
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
            const sections = renderResultSections(param.currentConfiguration.results);
            const debugLogSection = buildDebugLogSection(param.debug, this.logReport.getAccumulatedLogsAsText());
            const imageMarkdown = presentation.image && (
                (param.isIssue && param.images.imagesOnIssue)
                || (param.isPullRequest && param.images.imagesOnPullRequest)
            ) ? `![image](${presentation.image})` : '';

            const commentBody = `# ${presentation.title}
${sections.content}
${sections.errors}

${imageMarkdown}

${sections.footer}
${debugLogSection}
🚀 Happy coding!
            `;

            if (!hasPublishableContent(sections, debugLogSection)) {
                return;
            }

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
            if (issueNumber !== undefined) {
                await this.issueNotificationPort.addComment(
                    param.owner,
                    param.repo,
                    issueNumber,
                    commentBody,
                    param.tokens.token,
                )
            }
        } catch (error) {
            logError(error);
            param.currentConfiguration.results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to publish the resume, but there was a problem.`,
                    ],
                    errors: [error],
                })
            )
        }
    }
}
