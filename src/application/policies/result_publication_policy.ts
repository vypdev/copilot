import type { Result } from '../../data/model/result';
import { sanitizeAgentMarkdown } from './github_comment_publication_policy';
import { selectResultPublicationPresentation } from './result_publication_presentation_policy';
import { renderResultSections as renderPublicationSections } from './result_publication_sections_policy';
import type {
    ResultPublicationContext,
    ResultPublicationPresentation,
    ResultPublicationSections,
    ResultPublicationTargetInput,
} from './result_publication_contracts';

export type {
    ResultPublicationContext,
    ResultPublicationPresentation,
    ResultPublicationSections,
    ResultPublicationTargetInput,
} from './result_publication_contracts';

type ImageSelector = (images: string[]) => string | undefined;
const MAX_DEBUG_LOG_LENGTH = 12_000;

/** Resolves the GitHub discussion that receives a result comment. */
export function resolveResultPublicationIssueNumber(input: ResultPublicationTargetInput): number | undefined {
    if (input.isSingleAction) return input.singleActionIssue > 0 ? input.singleActionIssue : undefined;
    if (input.isIssue) return input.issueNumber;
    if (input.isPullRequest) return input.pullRequestNumber;
    if (input.isPush && input.pushIssueNumber > 0) return input.pushIssueNumber;
    return undefined;
}

export function resolveResultPublicationPresentation(
    context: ResultPublicationContext,
    selectImage: ImageSelector,
): ResultPublicationPresentation {
    return selectResultPublicationPresentation(context, selectImage);
}

export function renderResultSections(results: ReadonlyArray<Result>): ResultPublicationSections {
    return renderPublicationSections(results);
}

export function buildDebugLogSection(debug: boolean, logsText: string): string {
    if (!debug || logsText.length === 0) return '';
    const safeLogs = sanitizeAgentMarkdown(logsText, MAX_DEBUG_LOG_LENGTH).replace(/```/g, '');
    if (!safeLogs.trim()) return '';
    return `

<details>
<summary>Debug log</summary>

\`\`\`
${safeLogs}
\`\`\`
</details>
`;
}

export function hasPublishableContent(sections: ResultPublicationSections, debugLogSection: string): boolean {
    // Debug output belongs in the job summary/logs. Publishing it as the only
    // result creates a comment with just the presentation GIF and metadata,
    // which can retrigger `issue_comment` workflows indefinitely.
    // Reminders are supplementary guidance and must accompany primary result
    // content; they are not a result by themselves.
    void debugLogSection;
    return sections.content.trim().length > 0
        || sections.errors.trim().length > 0;
}
