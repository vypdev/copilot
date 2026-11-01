/** Proves that a complete provider patch reconstructs the exact immutable text sides, including final LF. */
export function bugbotPatchBindsText(patch: string, before: string, after: string): boolean {
    const oldLines = before.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
    const newLines = after.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
    const patchLines = patch.split('\n');
    let oldCursor = 0, newCursor = 0, hunks = 0, oldRemaining = 0, newRemaining = 0;
    for (let index = 0; index < patchLines.length; index++) {
        const line = patchLines[index];
        const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
        if (hunk) {
            if (oldRemaining || newRemaining) return false;
            const oldStart = Number(hunk[1]), newStart = Number(hunk[3]);
            oldRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
            newRemaining = hunk[4] === undefined ? 1 : Number(hunk[4]);
            if (![oldStart, newStart, oldRemaining, newRemaining].every(Number.isSafeInteger)
                || (oldStart === 0 && oldRemaining !== 0) || (newStart === 0 && newRemaining !== 0)) return false;
            const oldIndex = oldRemaining === 0 ? oldStart : oldStart - 1;
            const newIndex = newRemaining === 0 ? newStart : newStart - 1;
            if (oldIndex < oldCursor || newIndex < newCursor
                || oldIndex - oldCursor !== newIndex - newCursor
                || oldLines.slice(oldCursor, oldIndex).join('') !== newLines.slice(newCursor, newIndex).join('')) return false;
            oldCursor = oldIndex; newCursor = newIndex; hunks++; continue;
        }
        if (line === '' && oldRemaining === 0 && newRemaining === 0) continue;
        if (!hunks || ![' ', '+', '-'].includes(line[0])) return false;
        const noLf = patchLines[index + 1] === '\\ No newline at end of file';
        const value = line.slice(1) + (noLf ? '' : '\n');
        if (line[0] !== '+') {
            if (oldLines[oldCursor++] !== value || --oldRemaining < 0) return false;
        }
        if (line[0] !== '-') {
            if (newLines[newCursor++] !== value || --newRemaining < 0) return false;
        }
        if (noLf) index++;
    }
    return hunks > 0 && oldRemaining === 0 && newRemaining === 0
        && oldLines.slice(oldCursor).join('') === newLines.slice(newCursor).join('');
}
