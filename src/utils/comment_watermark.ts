const TRAILING_COMMENT_WATERMARK =
    /\s*<sup>(?:Made with ❤️ by|Written by) \[vypdev\/copilot\]\(https:\/\/github\.com\/marketplace\/actions\/copilot-github-with-super-powers\)[^<]*<\/sup>\s*$/u;

/** Removes legacy trailing Copilot watermarks before a read-modify-write update. */
export function stripTrailingCommentWatermarks(comment: string): string {
    let stripped = comment;
    while (TRAILING_COMMENT_WATERMARK.test(stripped)) {
        stripped = stripped.replace(TRAILING_COMMENT_WATERMARK, '');
    }
    return stripped.trimEnd();
}
