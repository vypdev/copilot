import { ApplicationError } from '../../application/errors/application_error';
import { isChangeSizeReconciliationFacts } from '../change_size_reconciliation';

const facts = { operation: 'pr-project-size' as const, issueNumber: 42, targetNumber: 99, projectIndex: 1,
    verifiedOperations: 7, pendingProjectSizes: 0, providerStatus: 'http-503', providerReference: 'ABCD:1234' };

it('copies and freezes public size failure facts', () => {
    const error = new ApplicationError('provider.unavailable', 'safe', { recovery: { id: 'change-size-reconciliation-failed', variables: facts } });
    expect(error.toJSON().recovery).toEqual({ id: 'change-size-reconciliation-failed', variables: facts });
    expect(Object.isFrozen(error.recovery?.variables)).toBe(true);
    expect(error.recovery?.variables).not.toBe(facts);
    expect(isChangeSizeReconciliationFacts({ ...facts, providerStatus: 'http-unavailable', projectIndex: 0 })).toBe(true);
});

it.each([
    { operation: 'secret' }, { issueNumber: 0 }, { targetNumber: -1 }, { targetNumber: '99' },
    { projectIndex: -1 }, { verifiedOperations: 0.5 }, { pendingProjectSizes: NaN },
    { providerStatus: 503 }, { providerStatus: 'http-999' },
    { providerReference: 12 }, { providerReference: 'secret with spaces' }, { providerReference: 'x'.repeat(65) },
])('rejects unsafe size recovery values %p', change => {
    expect(() => new ApplicationError('provider.unavailable', 'safe', { recovery: {
        id: 'change-size-reconciliation-failed', variables: { ...facts, ...change } as never,
    } })).toThrow('Change size reconciliation diagnostic is invalid.');
});

it('does not claim unchanged state after a required authorization failure with completed effects', () => {
    const error = new ApplicationError('authorization.denied', 'safe', { recovery: { id: 'change-size-reconciliation-failed', variables: facts } });
    expect(error.toJSON().retainedState).toContain('Completed effects were retained');
    expect(error.toJSON().retainedState).toContain('remain unverified');
});
