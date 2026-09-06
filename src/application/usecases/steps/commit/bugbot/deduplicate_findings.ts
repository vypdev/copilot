import type { BugbotFinding } from "./types";

/**
 * Deduplicates only findings that describe the same normalized problem at the
 * same location. Distinct bugs can legitimately share a line and must not be
 * discarded merely because their coordinates coincide.
 */
export function deduplicateFindings(findings: BugbotFinding[]): BugbotFinding[] {
    const seen = new Set<string>();
    const result: BugbotFinding[] = [];

    for (const f of findings) {
        const file = f.file?.trim() ?? '';
        const line = f.line ?? 0;
        const title = (f.title ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 160);
        const key = file || line
            ? `location:${file}:${line}:${title}`
            : `title:${title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(f);
    }

    return result;
}
