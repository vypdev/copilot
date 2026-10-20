import type { TitleLabelFacts } from '../ports/issue_title_ports';

/** Recognizes the conventional header shape; the consumer's CI owns its allowed types and subject rules. */
export function hasConventionalPullRequestTitle(title: string): boolean {
    return !title.includes('\n') && !title.includes('\r')
        && /^\p{L}[\p{L}\p{N}_-]*(?:\([^()\r\n]+\))?!?: +\S[^\r\n]*$/u.test(title);
}

export function generatedPullRequestTitle(
    sourceTitle: string,
    sanitizedSubject: string,
    issueNumber: number,
    labels: TitleLabelFacts,
): string {
    if (hasConventionalPullRequestTitle(sourceTitle)) return sourceTitle;
    const type = labels.isHotfix || labels.isBugfix || labels.isBug ? 'fix'
        : labels.isFeature || labels.isEnhancement ? 'feat'
            : labels.isDocs || labels.isDocumentation ? 'docs' : 'chore';
    const prefix = `${type}: `;
    const suffix = ` (#${issueNumber})`;
    const subject = (sanitizedSubject || 'Update linked issue').slice(0, 256 - prefix.length - suffix.length).trimEnd();
    return `${prefix}${subject}${suffix}`;
}
