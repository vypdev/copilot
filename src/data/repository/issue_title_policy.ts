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
