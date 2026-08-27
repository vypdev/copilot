/**
 * Watermark appended to comments (issues and PRs) to attribute Copilot.
 * Bugbot comments include commit link and note about auto-update on new commits.
 */

export const COPILOT_MARKETPLACE_URL =
    'https://github.com/marketplace/actions/copilot-github-with-super-powers';

const DEFAULT_WATERMARK = `<sup>Made with ❤️ by [vypdev/copilot](${COPILOT_MARKETPLACE_URL})</sup>`;

export interface BugbotWatermarkOptions {
    commitSha: string;
    owner: string;
    repo: string;
}

function commitUrl(owner: string, repo: string, sha: string): string {
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit/${sha}`;
}

export function getCommentWatermark(options?: BugbotWatermarkOptions): string {
    if (options?.commitSha && options?.owner && options?.repo) {
        const url = commitUrl(options.owner, options.repo, options.commitSha);
        return `<sup>Written by [vypdev/copilot](${COPILOT_MARKETPLACE_URL}) for commit [${options.commitSha}](${url}). This will update automatically on new commits.</sup>`;
    }
    return DEFAULT_WATERMARK;
}

const TRAILING_COMMENT_WATERMARK =
    /\s*<sup>(?:Made with ❤️ by|Written by) \[vypdev\/copilot\]\(https:\/\/github\.com\/marketplace\/actions\/copilot-github-with-super-powers\)[^<]*<\/sup>\s*$/u;

/** Removes all trailing Copilot watermarks before a read-modify-write update. */
export function stripTrailingCommentWatermarks(comment: string): string {
    let stripped = comment;
    while (TRAILING_COMMENT_WATERMARK.test(stripped)) {
        stripped = stripped.replace(TRAILING_COMMENT_WATERMARK, '');
    }
    return stripped.trimEnd();
}
