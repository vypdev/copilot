import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueNotificationPort } from "../../../ports/issue_lifecycle_ports";
import { getRandomElement } from "../../../../utils/list_utils";
import { getAccumulatedLogsAsText, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import {
    buildDebugLogSection,
    hasPublishableContent,
    renderResultSections,
    resolveResultPublicationPresentation,
} from "../../../policies/result_publication_policy";
import { ParamUseCase } from "../../base/param_usecase";

/**
 * Publish the resume of actions
 */
export class PublishResultUseCase implements ParamUseCase<Execution, void> {
    taskId: string = 'PublishResultUseCase';
    constructor(private readonly issueNotificationPort: IssueNotificationPort) {}

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
            const debugLogSection = buildDebugLogSection(param.debug, getAccumulatedLogsAsText());
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

            if (param.isSingleAction) {
                await this.issueNotificationPort.addComment(
                    param.owner,
                    param.repo,
                    param.singleAction.issue,
                    commentBody,
                    param.tokens.token,
                )
            } else if (param.isIssue) {
                await this.issueNotificationPort.addComment(
                    param.owner,
                    param.repo,
                    param.issue.number,
                    commentBody,
                    param.tokens.token,
                )
            } else if (param.isPullRequest) {
                await this.issueNotificationPort.addComment(
                    param.owner,
                    param.repo,
                    param.pullRequest.number,
                    commentBody,
                    param.tokens.token,
                )
            } else if (param.isPush && param.issueNumber > 0) {
                await this.issueNotificationPort.addComment(
                    param.owner,
                    param.repo,
                    param.issueNumber,
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
