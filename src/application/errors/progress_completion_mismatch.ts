import { normalizeProgressCompletionDiagnostic, type ProgressCompletionDiagnostic } from '../../domain/progress_completion_diagnostic';
import { ApplicationError } from './application_error';

/** The public direct-parser record stays unchanged; only the creating scope can use these private facts. */
export class ProgressCompletionMismatch extends ApplicationError {
    readonly #facts: ProgressCompletionDiagnostic;
    readonly #scope: object;

    constructor(original: ApplicationError, facts: ProgressCompletionDiagnostic, scope: object) {
        super(original.code, original.message, { correlationId: original.correlationId,
            retryable: original.retryable, recovery: original.recovery });
        this.#facts = normalizeProgressCompletionDiagnostic(facts);
        this.#scope = scope;
    }

    factsFor(scope: object): ProgressCompletionDiagnostic | undefined {
        return scope === this.#scope ? this.#facts : undefined;
    }
}
