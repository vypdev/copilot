/** Checks every unified hunk and both provider totals; never infers content from zero statistics. */
export function isCompleteProgressPatch(patch: unknown, additions: number, deletions: number): patch is string {
    if (typeof patch !== 'string' || !patch) return false;
    const lines = patch.split('\n');
    if (lines.at(-1) === '') lines.pop();
    let added = 0, removed = 0, before = 0, after = 0, hunks = 0;
    for (const line of lines) {
        const header = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?:.*)$/u.exec(line);
        if (header) {
            if (before !== 0 || after !== 0) return false;
            before = header[1] === undefined ? 1 : Number(header[1]);
            after = header[2] === undefined ? 1 : Number(header[2]);
            if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after)) return false;
            hunks++; continue;
        }
        if (!hunks) return false;
        if (line === '\\ No newline at end of file') continue;
        if (line.startsWith('+')) { added++; after--; }
        else if (line.startsWith('-')) { removed++; before--; }
        else if (line.startsWith(' ')) { before--; after--; }
        else return false;
        if (before < 0 || after < 0) return false;
    }
    return hunks > 0 && added + removed > 0 && before === 0 && after === 0 && added === additions && removed === deletions;
}
