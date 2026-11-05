import { progressCapacityDiagnostic, type ProgressCapacityContext, type ProgressCapacityDiagnostic, type ProgressCapacityInput } from '../../domain/progress_capacity_diagnostic';
import { ApplicationError } from './application_error';

/** Carries measured host facts, never a provider body or a partial assessment. */
export class ProgressCapacityFailure extends ApplicationError {
    readonly diagnostic: ProgressCapacityDiagnostic;
    constructor(input: ProgressCapacityInput, correlationId?: string) {
        const diagnostic = progressCapacityDiagnostic(input);
        super('validation.evidence-too-large', 'Progress evidence cannot satisfy a complete bounded capacity constraint. Existing progress was retained.', {
            ...(correlationId === undefined ? {} : { correlationId }),
            recovery: { id: 'progress-evidence-capacity-exceeded', variables: diagnostic },
        });
        this.diagnostic = diagnostic;
    }

    withContext(context: ProgressCapacityContext): ProgressCapacityFailure {
        const previous = this.diagnostic.context;
        if (previous.kind === 'comparison' || context.kind === 'unavailable'
            || (previous.kind === 'source-line' && context.kind !== 'comparison')) return this;
        const { phase, dimension, observedCount, supportedLimit, bound, countKind } = this.diagnostic;
        const selected = previous.kind === 'source-line' && context.kind === 'comparison' ? { ...context, sourceLineId: previous.sourceLineId } : context;
        return new ProgressCapacityFailure({ phase, dimension, observedCount, supportedLimit, bound, countKind, context: selected }, this.correlationId);
    }
}
