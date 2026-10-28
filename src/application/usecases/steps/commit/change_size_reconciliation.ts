import { ApplicationError } from '../../../errors/application_error';
import { ChangeSizeProviderError } from '../../../ports/change_size_provider_error';
import type { ChangeSizeOperation } from '../../../../domain/change_size_reconciliation';

/** Invocation-local evidence, never a replacement for fresh provider facts on replay. */
export class ChangeSizeReconciliation {
    private verifiedOperations = 0;
    pendingProjectSizes = 0;

    constructor(private readonly issueNumber: number) {}

    async run<T>(operation: ChangeSizeOperation, targetNumber: number, projectIndex: number, perform: () => Promise<T>): Promise<T> {
        try {
            const result = await perform();
            this.verifiedOperations += 1;
            return result;
        } catch (cause) {
            const semantic = cause instanceof ApplicationError ? cause : undefined;
            const provider = cause instanceof ChangeSizeProviderError ? cause : undefined;
            throw new ApplicationError(semantic?.code ?? 'unexpected', 'Size reconciliation stopped before completion.', {
                ...(semantic ? { retryable: semantic.retryable, correlationId: semantic.correlationId } : {}),
                recovery: { id: 'change-size-reconciliation-failed', variables: {
                    operation, issueNumber: this.issueNumber, targetNumber, projectIndex,
                    verifiedOperations: this.verifiedOperations, pendingProjectSizes: this.pendingProjectSizes,
                    providerStatus: provider?.providerStatus ?? 'http-unavailable',
                    providerReference: provider?.providerReference ?? 'unavailable',
                } },
            });
        }
    }
}
