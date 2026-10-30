import { isDeploymentOperationSnapshot } from './deployment_operation';

export type DeploymentIssueCompletion = 'pending' | 'complete';

/** Ordinary issues have no operation. Unknown stored state cannot certify completion. */
export function projectDeploymentIssueCompletion(value: unknown): DeploymentIssueCompletion | undefined {
    if (value === undefined) return undefined;
    if (!isDeploymentOperationSnapshot(value)) throw new Error('Durable deployment completion state is invalid or unsupported.');
    return value.phase === 'completed' && value.publicationVerified && value.publicationReceipt !== undefined
        && value.reconciliationTargets.every(target => target.status === 'completed')
        ? 'complete' : 'pending';
}
