import { isProgressEvidencePath, renderProgressEvidencePath } from './progress_evidence_path';
export const PROGRESS_INVENTORY_REASONS = Object.freeze([
    'inventory', 'identity', 'capability', 'prefix', 'source-moved', 'binary', 'file-count', 'files', 'bytes', 'requests',
    'treeEntries', 'frames', 'blob-size', 'units', 'partition', 'manifest', 'facts',
] as const);
export type ProgressInventoryReason = typeof PROGRESS_INVENTORY_REASONS[number];
export interface ProgressInventoryDiagnostic {
    readonly profile: 'immutable-tree-v1';
    readonly reason: ProgressInventoryReason;
    readonly observedCount: number;
    readonly supportedLimit: number;
    readonly countKind: 'exact' | 'at-least';
    readonly paths: string;
}
export function progressInventoryDiagnostic(reason: ProgressInventoryReason, observedCount: number, supportedLimit: number,
    paths: readonly string[], countKind: 'exact' | 'at-least' = 'exact'): ProgressInventoryDiagnostic {
    const named: string[] = [];
    for (const path of [...new Set(paths)].slice(0, 8)) {
        if (Buffer.byteLength(JSON.stringify([...named, path])) > 8_192) break;
        named.push(path);
    }
    return Object.freeze({ profile: 'immutable-tree-v1', reason, observedCount, supportedLimit, countKind, paths: JSON.stringify(named) });
}
export function isProgressInventoryDiagnostic(value: object): boolean {
    const facts = value as Readonly<Record<string, unknown>>;
    if (Object.keys(facts).sort().join(',') !== 'countKind,observedCount,paths,profile,reason,supportedLimit'
        || facts.profile !== 'immutable-tree-v1' || !PROGRESS_INVENTORY_REASONS.includes(facts.reason as ProgressInventoryReason)
        || !['exact', 'at-least'].includes(facts.countKind as string)
        || ![facts.observedCount, facts.supportedLimit].every(count => Number.isSafeInteger(count) && (count as number) >= 0)
        || typeof facts.paths !== 'string' || Buffer.byteLength(facts.paths) > 8_192) return false;
    let paths: unknown;
    try { paths = JSON.parse(facts.paths); } catch { return false; }
    return Array.isArray(paths) && paths.length <= 8 && new Set(paths).size === paths.length
        && paths.every(isProgressEvidencePath) && JSON.stringify(paths) === facts.paths;
}
export function progressInventoryPresentation(facts: ProgressInventoryDiagnostic): Readonly<Record<string, string | number>> {
    return Object.freeze({ ...facts, countKind: facts.countKind === 'at-least' ? '≥' : '=', paths: (JSON.parse(facts.paths) as string[]).map(renderProgressEvidencePath).join('; ') });
}
