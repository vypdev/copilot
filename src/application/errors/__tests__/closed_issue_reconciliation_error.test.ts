import { ApplicationError } from '../application_error';
import { closedIssueReconciliationError } from '../closed_issue_reconciliation_error';
import { renderApplicationErrorText } from '../../policies/application_error_presentation_policy';

const facts = { resultId: 'RetireProgressUseCase', phase: 'card-verification', state: 'closed', reason: 'completed', changed: 1, remaining: 1 } as const;
it('preserves safe causal classification and correlation across serialization', () => {
    const cause = new ApplicationError('workflow.stale', 'SECRET provider output');
    const error = closedIssueReconciliationError(cause, facts);
    const record = JSON.parse(JSON.stringify(error));
    expect(record).toMatchObject({ code: 'workflow.stale', retryable: false, correlationId: cause.correlationId });
    expect(renderApplicationErrorText(record)).toContain('RetireProgressUseCase, phase card-verification');
    expect(renderApplicationErrorText(record)).toContain('Confirmed changes: 1');
    expect(JSON.stringify(record)).not.toContain('SECRET');
});
it.each([{ ...facts, changed: -1 }, { ...facts, phase: '@everyone' }, { ...facts, reason: '<script>' }])('rejects forged native diagnostics (%j)', variables => {
    expect(() => closedIssueReconciliationError(new Error('SECRET'), variables as never)).toThrow('diagnostic is invalid');
});
