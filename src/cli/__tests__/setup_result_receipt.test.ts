import { ApplicationError } from '../../data/model/application_error';
import { Result } from '../../data/model/result';
import { setupActionResultFailure, setupResultEffects, setupResultReason } from '../setup_result_receipt';

const reference = '12345678-1234-4123-8123-123456789abc';

describe('setup result receipt', () => {
  test('reads only the versioned, complete, value-free resource receipt', () => {
    const effects = [
      { id: 'files', state: 'completed', scope: 'local' },
      { id: 'secrets', state: 'needs-inspection', scope: 'organization' },
      { id: 'labels', state: 'skipped', scope: 'repository' },
      { id: 'issue-types', state: 'completed', scope: 'repository' },
      { id: 'variables', state: 'not-started', scope: 'mixed' },
      { id: 'initial-tag', state: 'not-started', scope: 'repository' },
    ];
    const result = new Result({ id: 'InitialSetupUseCase', success: false, executed: true,
      payload: { setupReceipt: { version: 1, effects, secretValue: 'must-never-appear' } } });
    expect(setupResultEffects([result])).toEqual(effects);
    expect(JSON.stringify(setupResultEffects([result]))).not.toContain('must-never-appear');
    const poisoned = new Result({ id: 'github_pat_fake', success: false, executed: true,
      payload: { setupReceipt: { version: 1, effects: effects.map(item => item.id === 'files' ? { ...item, id: 'github_pat_fake' } : item) } } });
    expect(setupResultEffects([poisoned])).toEqual([{ id: 'step-1', state: 'needs-inspection' }]);
  });
  test.each([
    ['authorization.denied', 'permissions'],
    ['configuration.invalid', 'configuration'],
    ['provider.rate-limited', 'rate-limit'],
    ['provider.unavailable', 'provider'],
    ['workflow.failed', 'unknown'],
  ] as const)('maps %s to a redacted %s reason', (code, reason) => {
    expect(setupResultReason(code)).toBe(reason);
  });

  test('does not serialize provider error messages or unsafe action identifiers', () => {
    const error = new ApplicationError('provider.unavailable', 'private diagnostic', { correlationId: reference });
    const results = [
      new Result({ id: 'files', success: true, executed: true }),
      new Result({ id: 'secret\nPAT', success: false, executed: true, errors: [error] }),
      new Result({ id: 'variables', success: true, executed: false }),
    ];
    expect(setupResultEffects(results)).toEqual([
      { id: 'files', state: 'completed' },
      { id: 'step-2', state: 'needs-inspection' },
      { id: 'variables', state: 'skipped' },
    ]);
    expect(setupActionResultFailure(results)).toEqual({ reasonCode: 'provider', diagnosticRef: reference });
    expect(JSON.stringify(setupResultEffects(results))).not.toContain('private diagnostic');
  });

  test('uses unknown reason for failed result without structured error', () => {
    expect(setupActionResultFailure([new Result({ id: 'files', success: false })])).toEqual({ reasonCode: 'unknown' });
    expect(setupActionResultFailure([new Result({ id: 'files', success: true })])).toBeUndefined();
  });

  test('does not throw or leak text if a legacy action returns an unstructured error', () => {
    const result = { id: 'InitialSetupUseCase', success: false, executed: true,
      errors: ['private provider diagnostic'] } as unknown as Result;
    expect(setupActionResultFailure([result])).toEqual({ reasonCode: 'unknown' });
    expect(setupResultEffects([result])).toEqual([{ id: 'setup-workflow', state: 'needs-inspection' }]);
  });
});
