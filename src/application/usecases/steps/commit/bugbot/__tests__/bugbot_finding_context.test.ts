import { buildPreviousFindingsContext } from '../bugbot_previous_findings_context';

describe('Bugbot previous-finding context budget', () => {
  it('returns an empty bounded context for no previous findings', () => {
    expect(buildPreviousFindingsContext([])).toEqual({ block: '', selected: [], omitted: 0 });
  });

  it('keeps the newest 100 findings, renders them chronologically, and names omissions', () => {
    const context = buildPreviousFindingsContext(
      Array.from({ length: 101 }, (_, index) => ({
        id: `finding-${String(index).padStart(3, '0')}`,
        fullBody: `body-${String(index).padStart(3, '0')}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        providerId: `issue:${index}`,
      })),
    );

    expect(context.selected).toHaveLength(100);
    expect(context.selected[0].id).toBe('finding-001');
    expect(context.selected[99].id).toBe('finding-100');
    expect(context.block).not.toContain('body-000');
    expect(context.block).toContain('1 older finding(s) were omitted');
    expect(context.block.length).toBeLessThanOrEqual(48_000);
  });

  it('uses provider identity as a deterministic tie-breaker', () => {
    const context = buildPreviousFindingsContext([
      { id: 'a', fullBody: 'first', createdAt: '2026-01-01T00:00:00.000Z', providerId: 'issue:1' },
      { id: 'b', fullBody: 'second', createdAt: '2026-01-01T00:00:00.000Z', providerId: 'issue:2' },
    ]);

    expect(context.selected.map(({ id }) => id)).toEqual(['a', 'b']);
  });

  it('uses stable finding IDs when dates and provider IDs are absent', () => {
    const context = buildPreviousFindingsContext([
      { id: 'a`id', fullBody: 'first' },
      { id: 'b', fullBody: 'second', createdAt: 'not-a-date' },
    ]);

    expect(context.selected.map(({ id }) => id)).toEqual(['a`id', 'b']);
    expect(context.block).toContain('a\\`id');
  });

  it('stops before a finding that would exceed the complete character budget', () => {
    const context = buildPreviousFindingsContext(
      Array.from({ length: 5 }, (_, index) => ({
        id: `large-${index}`,
        fullBody: String(index).repeat(12_000),
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      })),
    );

    expect(context.omitted).toBeGreaterThan(0);
    expect(context.block.length).toBeLessThanOrEqual(48_000);
  });
});
