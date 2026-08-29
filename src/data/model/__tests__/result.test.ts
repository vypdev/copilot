import { getResultPayload, Result } from '../result';

describe('Result', () => {
  it('uses defaults for missing fields', () => {
    const r = new Result({});
    expect(r.id).toBe('');
    expect(r.success).toBe(false);
    expect(r.executed).toBe(false);
    expect(r.steps).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.reminders).toEqual([]);
    expect(r.payload).toBeUndefined();
  });

  it('assigns provided fields', () => {
    const r = new Result({
      id: 'Task1',
      success: true,
      executed: true,
      steps: ['Step 1'],
      payload: { key: 'value' },
      reminders: ['Reminder'],
      errors: [],
    });
    expect(r.id).toBe('Task1');
    expect(r.success).toBe(true);
    expect(r.executed).toBe(true);
    expect(r.steps).toEqual(['Step 1']);
    expect(r.payload).toEqual({ key: 'value' });
    expect(r.reminders).toEqual(['Reminder']);
  });

  it('normalizes string and unknown errors and preserves legacy singular errors', () => {
    const error = new Error('typed failure');
    const r = new Result({ errors: ['string failure', error], error: 'legacy failure' });

    expect(r.errors.map((item) => item.message)).toEqual(['string failure', 'typed failure']);
  });

  it('does not lose a legacy singular error when no plural errors are provided', () => {
    const r = new Result({ error: new Error('legacy failure') });

    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toBe('legacy failure');
  });

  it('does not expose array payloads as object payloads and tolerates malformed collections', () => {
    const result = new Result({
      steps: 'invalid' as unknown as string[],
      reminders: null as unknown as string[],
      errors: null as unknown as unknown[],
      payload: ['not-an-object'],
    });

    expect(result.steps).toEqual([]);
    expect(result.reminders).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(getResultPayload(result.payload)).toBeUndefined();
  });
});
