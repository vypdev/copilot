import { isProgressEvidencePath, renderProgressEvidencePath } from './progress_evidence_path';
export interface ProgressBinaryEvidenceFacts { readonly paths: string; readonly pathCount: number }

/** Canonical, bounded exact paths. The total discloses additional unreviewed paths in the pinned inventory. */
export function progressBinaryEvidenceFacts(paths: readonly string[]): ProgressBinaryEvidenceFacts {
    const named: string[] = [];
    for (const path of paths.slice(0, 8)) {
        if (Buffer.byteLength(JSON.stringify([...named, path]), 'utf8') > 8_192) break;
        named.push(path);
    }
    return Object.freeze({ paths: JSON.stringify(named), pathCount: paths.length });
}
export function isProgressBinaryEvidenceFacts(value: Readonly<Record<string, unknown>>): boolean {
    if (typeof value.paths !== 'string' || Buffer.byteLength(value.paths, 'utf8') > 8_192
        || typeof value.pathCount !== 'number' || !Number.isSafeInteger(value.pathCount) || value.pathCount < 1 || value.pathCount > 299) return false;
    let paths: unknown;
    try { paths = JSON.parse(value.paths); } catch { return false; }
    return Array.isArray(paths) && paths.length >= 1 && paths.length <= Math.min(value.pathCount, 8) && new Set(paths).size === paths.length
        && paths.every(isProgressEvidencePath) && JSON.stringify(paths) === value.paths;
}

/** JSON renders control characters literally; a noncolliding code span keeps paths inert in Markdown and plain CLI text. */
export function progressBinaryEvidencePresentation(facts: ProgressBinaryEvidenceFacts): Readonly<Record<string, string | number>> {
    const paths = (JSON.parse(facts.paths) as string[]).map(renderProgressEvidencePath);
    return Object.freeze({ paths: paths.join('; '), pathCount: facts.pathCount, shownCount: paths.length });
}
