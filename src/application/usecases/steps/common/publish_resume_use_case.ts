import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueNotificationPort } from "../../../ports/issue_lifecycle_ports";
import { getRandomElement } from "../../../../utils/list_utils";
import { getAccumulatedLogsAsText, logError, logInfo } from "../../../../utils/logger";
import { getTaskEmoji } from "../../../../utils/task_emoji";
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
            /**
             * Comment resume of actions
             */
            let title = '🪄 Automatic Actions'
            let content = ''
            let stupidGif = ''
            let image: string | undefined
            let errors = ''
            let footer = ''
            if (param.isIssue) {
                if (param.issueNotBranched) {
                    title = '🪄 Automatic Actions'
                    image = getRandomElement(param.images.issueAutomaticActions)
                } else if (param.release.active) {
                    title = '🚀 Release Actions'
                    image = getRandomElement(param.images.issueReleaseGifs)
                } else if (param.hotfix.active) {
                    title = '🔥🐛 Hotfix Actions'
                    image = getRandomElement(param.images.issueHotfixGifs)
                } else if (param.isBugfix) {
                    title = '🐛 Bugfix Actions'
                    image = getRandomElement(param.images.issueBugfixGifs)
                } else if (param.isFeature) {
                    title = '✨ Feature Actions'
                    image = getRandomElement(param.images.issueFeatureGifs)
                } else if (param.isDocs) {
                    title = '📝 Documentation Actions'
                    image = getRandomElement(param.images.issueDocsGifs)
                } else if (param.isChore) {
                    title = '🔧 Chore Actions'
                    image = getRandomElement(param.images.issueChoreGifs)
                }
            } else if (param.isPullRequest) {
                if (param.release.active) {
                    title = '🚀 Release Actions'
                    image = getRandomElement(param.images.pullRequestReleaseGifs)
                } else if (param.hotfix.active) {
                    title = '🔥🐛 Hotfix Actions'
                    image = getRandomElement(param.images.pullRequestHotfixGifs)
                } else if (param.isBugfix) {
                    title = '🐛 Bugfix Actions'
                    image = getRandomElement(param.images.pullRequestBugfixGifs)
                } else if (param.isFeature) {
                    title = '✨ Feature Actions'
                    image = getRandomElement(param.images.pullRequestFeatureGifs)
                } else if (param.isDocs) {
                    title = '📝 Documentation Actions'
                    image = getRandomElement(param.images.pullRequestDocsGifs)
                } else if (param.isChore) {
                    title = '🔧 Chore Actions'
                    image = getRandomElement(param.images.pullRequestChoreGifs)
                } else {
                    title = '🪄 Automatic Actions'
                    image = getRandomElement(param.images.pullRequestAutomaticActions)
                }
            }

            if (image) {
                if (param.isIssue && param.images.imagesOnIssue) {
                    stupidGif = `![image](${image})`
                } else if (param.isPullRequest && param.images.imagesOnPullRequest) {
                    stupidGif = `![image](${image})`
                }
            }

            let indexStep = 0
            param.currentConfiguration.results.forEach(r => {
                for (const step of r.steps) {
                    content += `${indexStep + 1}. ${step}\n`
                    indexStep++
                }
            });

            let indexReminder = 0
            param.currentConfiguration.results.forEach(r => {
                for (const reminder of r.reminders) {
                    footer += `${indexReminder + 1}. ${reminder}\n`
                    indexReminder++
                }
            });

            let indexError = 0
            param.currentConfiguration.results.forEach(r => {
                for (const error of r.errors) {
                    errors += `${indexError + 1}.
\`\`\`
${error}
\`\`\`
`
                    indexError++
                }
            });

            if (footer.length > 0) {
                footer = `
## Reminder

${footer}
`
            }

            if (errors.length > 0) {
                errors = `
## Errors Found

${errors}

Check your project configuration, if everything is okay consider [opening an issue](https://github.com/vypdev/copilot/issues/new/choose).
`
            }

            let debugLogSection = '';
            if (param.debug) {
                const logsText = getAccumulatedLogsAsText();
                if (logsText.length > 0) {
                    debugLogSection = `

<details>
<summary>Debug log</summary>

\`\`\`
${logsText}
\`\`\`
</details>
`;
                }
            }

            const commentBody = `# ${title}
${content}
${errors.length > 0 ? errors : ''}

${stupidGif}

${footer}
${debugLogSection}
🚀 Happy coding!
            `;

            if (content.length === 0) {
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
                    error: error,
                })
            )
        }
    }
}