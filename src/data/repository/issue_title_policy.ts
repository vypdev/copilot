const sanitize = (title: string, removeVersions: boolean, allowedCharacters: RegExp): string => {
    let sanitized = title;
    if (removeVersions) {
        sanitized = sanitized.replace(/\b\d+(\.\d+){2,}\b/g, '').replace(/\bUnknown Version\b/gi, '');
    }
    return sanitized
        .replace(/[^\p{L}\p{N}\p{P}\p{Z}^$\n]/gu, '')
        .replace(/\u200D/g, '')
        .replace(/[^\S\r\n]+/g, ' ')
        .replace(allowedCharacters, '')
        .replace(/^-+|-+$/g, '')
        .replace(/- -/g, '-')
        .trim()
        .replace(/-+/g, '-')
        .trim();
};

export const sanitizeIssueTitle = (title: string): string => sanitize(title, true, /[^a-zA-Z0-9 .]/g);
export const sanitizePullRequestTitle = (title: string): string => sanitize(title, false, /[^a-zA-Z0-9 ]/g);

/** Removes Copilot's generated PR prefix before formatting the title again. */
export function normalizePullRequestSourceTitle(title: string, issueNumber: number): string {
    const escapedIssueNumber = String(issueNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const generatedPrefix = new RegExp(`^\\s*\\[#${escapedIssueNumber}\\]\\s*[^\\p{L}\\p{N}]*-\\s*`, 'iu');
    let normalized = title.trim();
    let removedGeneratedPrefix = false;
    let previous: string;
    do {
        previous = normalized;
        const withoutPrefix = normalized.replace(generatedPrefix, '');
        removedGeneratedPrefix = removedGeneratedPrefix || withoutPrefix !== normalized;
        normalized = withoutPrefix.trim();
    } while (normalized !== previous);

    if (removedGeneratedPrefix) {
        const generatedIssueNumberPrefix = new RegExp(`^(?:${escapedIssueNumber}\\s+)+`, 'u');
        normalized = normalized.replace(generatedIssueNumberPrefix, '').trim();
    }
    return normalized;
}
