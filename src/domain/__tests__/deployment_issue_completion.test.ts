import { projectDeploymentIssueCompletion as project } from '../deployment_issue_completion';
import { blockDeploymentOperation, isDeploymentOperationSnapshot } from '../deployment_operation';
import { deploymentOperationFixture as operation, completedDeploymentFixture as completed } from '../../testing/deployment_operation_fixture';

it('keeps ordinary issues outside the deployment completion boundary', () => expect(project(undefined)).toBeUndefined());
it.each([null, {}, { stateVersion: 2 }])('rejects invalid or future durable state %j', value => expect(() => project(value)).toThrow());
it.each(['preparing', 'publishing', 'reconciliation_pending'] as const)('defers %s even if native issue closure already occurred', phase => {
    const state = operation({ phase }); expect(isDeploymentOperationSnapshot(state)).toBe(true);
    expect(project(state)).toBe('pending');
});
it('defers retryable publication failure without discarding its operation', () => {
    const state = blockDeploymentOperation(operation({ phase: 'publishing' }), 'publication', 'Protected publication pending', true);
    expect(project(state)).toBe('pending'); expect(state.operationId).toBe('operation-12345678');
});
it('accepts only verified completed functional state', () => expect(project(completed())).toBe('complete'));
it('does not trust a completed phase without publication', () => expect(project(operation({ phase: 'completed' }))).toBe('pending'));
it('rejects a claimed publication without its immutable receipt', () => expect(() => project(completed({ publicationReceipt: undefined }))).toThrow());
it('defers a completed claim with a reconciliation target still pending', () => {
    expect(project(completed({ reconciliationTargets: [{ targetBranch: 'develop', sourceBranch: 'master',
        sourceSha: 'c'.repeat(40), status: 'pending' }] }))).toBe('pending');
});
