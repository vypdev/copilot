import type { BugbotFinding } from "./types";

/**
 * Deduplicates findings by (file, line). When two findings share the same file and line,
 * keeps the first; when they have no file, groups by normalized title and keeps the first.
 * This reduces noise when the agent returns near-duplicate issues.
 */
export function deduplicateFindings(findings: BugbotFinding[]): BugbotFinding[] {
    const seen = new Set<string>();
    const result: BugbotFinding[] = [];

    for (const f of findings) {
        const file = f.file?.trim() ?? '';
        const line = f.line ?? 0;
        const key =
            file || line
                ? `${file}:${line}`
                : `title:${(f.title ?? '').toLowerCase().trim().slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(f);
    }

    return result;
}
