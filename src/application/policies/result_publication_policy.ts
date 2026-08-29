import type { Images } from '../../data/model/images';
import type { Result } from '../../data/model/result';

export interface ResultPublicationContext {
    isIssue: boolean;
    isPullRequest: boolean;
    issueNotBranched: boolean;
    releaseActive: boolean;
    hotfixActive: boolean;
    isBugfix: boolean;
    isFeature: boolean;
    isDocs: boolean;
    isChore: boolean;
    images: Images;
}

export interface ResultPublicationPresentation {
    title: string;
    image?: string;
}

export interface ResultPublicationSections {
    content: string;
    footer: string;
    errors: string;
}

export interface ResultPublicationTargetInput {
    isSingleAction: boolean;
    singleActionIssue: number;
    isIssue: boolean;
    issueNumber: number;
    isPullRequest: boolean;
    pullRequestNumber: number;
    isPush: boolean;
    pushIssueNumber: number;
}

type ImageSelector = (images: string[]) => string | undefined;

/** Resolves the GitHub discussion that receives a result comment. */
export function resolveResultPublicationIssueNumber(input: ResultPublicationTargetInput): number | undefined {
    if (input.isSingleAction) return input.singleActionIssue;
    if (input.isIssue) return input.issueNumber;
    if (input.isPullRequest) return input.pullRequestNumber;
    if (input.isPush && input.pushIssueNumber > 0) return input.pushIssueNumber;
    return undefined;
}

export function resolveResultPublicationPresentation(
    context: ResultPublicationContext,
    selectImage: ImageSelector,
): ResultPublicationPresentation {
    if (context.isIssue) {
        if (context.issueNotBranched) return { title: '🪄 Automatic Actions', image: selectImage(context.images.issueAutomaticActions) };
        if (context.releaseActive) return { title: '🚀 Release Actions', image: selectImage(context.images.issueReleaseGifs) };
        if (context.hotfixActive) return { title: '🔥🐛 Hotfix Actions', image: selectImage(context.images.issueHotfixGifs) };
        if (context.isBugfix) return { title: '🐛 Bugfix Actions', image: selectImage(context.images.issueBugfixGifs) };
        if (context.isFeature) return { title: '✨ Feature Actions', image: selectImage(context.images.issueFeatureGifs) };
        if (context.isDocs) return { title: '📝 Documentation Actions', image: selectImage(context.images.issueDocsGifs) };
        if (context.isChore) return { title: '🔧 Chore Actions', image: selectImage(context.images.issueChoreGifs) };
    }

    if (context.isPullRequest) {
        if (context.releaseActive) return { title: '🚀 Release Actions', image: selectImage(context.images.pullRequestReleaseGifs) };
        if (context.hotfixActive) return { title: '🔥🐛 Hotfix Actions', image: selectImage(context.images.pullRequestHotfixGifs) };
        if (context.isBugfix) return { title: '🐛 Bugfix Actions', image: selectImage(context.images.pullRequestBugfixGifs) };
        if (context.isFeature) return { title: '✨ Feature Actions', image: selectImage(context.images.pullRequestFeatureGifs) };
        if (context.isDocs) return { title: '📝 Documentation Actions', image: selectImage(context.images.pullRequestDocsGifs) };
        if (context.isChore) return { title: '🔧 Chore Actions', image: selectImage(context.images.pullRequestChoreGifs) };
        return { title: '🪄 Automatic Actions', image: selectImage(context.images.pullRequestAutomaticActions) };
    }

    return { title: '🪄 Automatic Actions' };
}

export function renderResultSections(results: ReadonlyArray<Result>): ResultPublicationSections {
    let stepIndex = 0;
    const renderedSteps: string[] = [];
    let reminderIndex = 0;
    const reminders: string[] = [];
    let errorIndex = 0;
    const errors: string[] = [];

    for (const result of results) {
        for (const step of result.steps) {
            if (!step.trim()) continue;
            renderedSteps.push(result.stepFormat === 'markdown' ? step : `${stepIndex + 1}. ${step}`);
            if (result.stepFormat !== 'markdown') stepIndex += 1;
        }
        for (const reminder of result.reminders) {
            reminders.push(`${reminderIndex + 1}. ${reminder}`);
            reminderIndex += 1;
        }
        for (const error of result.errors) {
            errors.push(`${errorIndex + 1}.\n\`\`\`\n${error.message}\n\`\`\`\n`);
            errorIndex += 1;
        }
    }

    return {
        content: renderedSteps.length > 0 ? `${renderedSteps.join('\n\n')}\n` : '',
        footer: reminders.length > 0 ? `\n## Reminder\n\n${reminders.join('\n')}\n` : '',
        errors: errors.length > 0
            ? `\n## Errors Found\n\n${errors.join('')}\n\nCheck your project configuration, if everything is okay consider [opening an issue](https://github.com/vypdev/copilot/issues/new/choose).\n`
            : '',
    };
}

export function buildDebugLogSection(debug: boolean, logsText: string): string {
    if (!debug || logsText.length === 0) return '';
    return `

<details>
<summary>Debug log</summary>

\`\`\`
${logsText}
\`\`\`
</details>
`;
}

export function hasPublishableContent(sections: ResultPublicationSections, debugLogSection: string): boolean {
    return sections.content.length > 0
        || sections.errors.length > 0
        || sections.footer.length > 0
        || debugLogSection.length > 0;
}
