import { ApplicationError } from '../errors/application_error';
import type { ProgressBatchDiagnostic, ProgressBatchReason } from '../../domain/progress_batch_diagnostic';

export function progressBatchRejected(reason: ProgressBatchReason, facts: Partial<Omit<ProgressBatchDiagnostic, 'reason'>> = {}): ApplicationError {
    const variables: ProgressBatchDiagnostic = { reason, verified: 0, expected: 0, batch: 0, requirementId: 'none', ...facts };
    return new ApplicationError('validation.evidence-unavailable', 'Complete same-head progress evidence was not verified. Existing progress was retained.',
        { recovery: { id: 'progress-batch-retained', variables } });
}
