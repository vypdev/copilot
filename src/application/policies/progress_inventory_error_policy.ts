import { ApplicationError } from '../errors/application_error';
import { progressInventoryDiagnostic, type ProgressInventoryReason } from '../../domain/progress_inventory_diagnostic';

export function progressInventoryError(reason: ProgressInventoryReason, observedCount: number, supportedLimit: number,
    paths: readonly string[] = [], countKind: 'exact' | 'at-least' = 'exact'): ApplicationError {
    return new ApplicationError(['file-count', 'files', 'bytes', 'requests', 'treeEntries', 'frames', 'blob-size', 'units', 'partition', 'manifest', 'facts'].includes(reason)
        ? 'validation.evidence-too-large' : 'validation.evidence-unavailable',
        `Complete immutable progress collection stopped (${reason}: ${countKind} ${observedCount}, limit ${supportedLimit}). Existing progress was retained.`,
        { recovery: { id: 'progress-inventory-incomplete', variables: progressInventoryDiagnostic(reason, observedCount, supportedLimit, paths, countKind) } });
}
