export declare const PROGRESS_INVENTORY_REASONS: readonly ["inventory", "identity", "capability", "prefix", "source-moved", "binary", "file-count", "files", "bytes", "requests", "treeEntries", "frames", "blob-size", "units", "partition", "manifest", "facts"];
export type ProgressInventoryReason = typeof PROGRESS_INVENTORY_REASONS[number];
export interface ProgressInventoryDiagnostic {
    readonly profile: 'immutable-tree-v1';
    readonly reason: ProgressInventoryReason;
    readonly observedCount: number;
    readonly supportedLimit: number;
    readonly countKind: 'exact' | 'at-least';
    readonly paths: string;
}
export declare function progressInventoryDiagnostic(reason: ProgressInventoryReason, observedCount: number, supportedLimit: number, paths: readonly string[], countKind?: 'exact' | 'at-least'): ProgressInventoryDiagnostic;
export declare function isProgressInventoryDiagnostic(value: object): boolean;
export declare function progressInventoryPresentation(facts: ProgressInventoryDiagnostic): Readonly<Record<string, string | number>>;
