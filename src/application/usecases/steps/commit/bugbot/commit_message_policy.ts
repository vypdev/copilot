/** Maximum length of one finding ID in a commit message. */
export const MAX_FINDING_ID_LENGTH_COMMIT = 80;
/** Maximum length of the finding IDs segment in a commit message. */
export const MAX_FINDING_IDS_PART_LENGTH = 500;

export function sanitizeFindingIdForCommitMessage(id: string): string {
    const withoutNewlines = String(id).replace(/\r\n|\r|\n/g, " ");
    const withoutControlChars = withoutNewlines.replace(/[\s\S]/g, (character) => {
        const code = character.charCodeAt(0);
        if (code < 32 && code !== 9) return "";
        if (code === 127) return "";
        return character;
    });
    const trimmed = withoutControlChars.trim();
    return trimmed.length <= MAX_FINDING_ID_LENGTH_COMMIT
        ? trimmed
        : trimmed.slice(0, MAX_FINDING_ID_LENGTH_COMMIT);
}

export function buildFindingIdsPartForCommit(targetFindingIds: string[]): string {
    if (targetFindingIds.length === 0) return "reported findings";
    const sanitized = targetFindingIds.map(sanitizeFindingIdForCommitMessage).filter(Boolean);
    if (sanitized.length === 0) return "reported findings";
    const part = sanitized.join(", ");
    return part.length <= MAX_FINDING_IDS_PART_LENGTH
        ? part
        : part.slice(0, MAX_FINDING_IDS_PART_LENGTH - 3) + "...";
}

export function buildBugbotCommitMessage(issueNumber: number, targetFindingIds: string[]): string {
    const findingIdsPart = buildFindingIdsPartForCommit(targetFindingIds);
    return issueNumber > 0
        ? `fix(#${issueNumber}): bugbot autofix - resolve ${findingIdsPart}`
        : `fix: bugbot autofix - resolve ${findingIdsPart}`;
}

export function buildUserRequestCommitMessage(issueNumber: number): string {
    return issueNumber > 0 ? `chore(#${issueNumber}): apply user request` : "chore: apply user request";
}
