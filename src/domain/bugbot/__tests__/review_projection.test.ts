import { buildBugbotReviewProjection } from '../review_projection';

describe('buildBugbotReviewProjection', () => {
  const completeCoverage = { status: 'complete' as const, sources: [] };
  const base = {
    pullRequestNumber: 358,
    analyzedHeadSha: 'a'.repeat(40),
    coverage: completeCoverage,
    findings: [
      { id: 'b', state: 'fixed' as const, parentReviewIdentity: '20' },
      { id: 'a', state: 'open' as const, parentReviewIdentity: '10' },
      { id: 'c', state: 'verification-required' as const },
    ],
  };

  it('sorts findings, counts states, and exposes actionable work', () => {
    const projection = buildBugbotReviewProjection(base);
    expect(projection.findings.map((finding) => finding.id)).toEqual(['a', 'b', 'c']);
    expect(projection.actionableCount).toBe(2);
    expect(projection.counts).toMatchObject({
      open: 1,
      fixed: 1,
      'verification-required': 1,
    });
    expect(projection.outcome).toBe('complete');
  });

  it('is deterministic for equivalent input ordering', () => {
    const left = buildBugbotReviewProjection(base);
    const right = buildBugbotReviewProjection({
      ...base,
      findings: [...base.findings].reverse(),
    });
    expect(right.digest).toBe(left.digest);
  });

  it.each([
    [{ errors: ['write failed'] }, 'partial'],
    [{ findings: [], errors: ['analysis failed'] }, 'failed'],
    [{ findings: [{ id: 'unknown', state: 'unknown' as const }] }, 'partial'],
    [{ superseded: true, errors: ['ignored'] }, 'superseded'],
    [{ dryRun: true, errors: ['ignored'] }, 'dry-run'],
  ] as const)('derives the requested outcome', (override, outcome) => {
    expect(buildBugbotReviewProjection({ ...base, ...override }).outcome).toBe(outcome);
  });

  it('uses a separately verified head in identity and digest', () => {
    const projection = buildBugbotReviewProjection({
      ...base,
      verifiedHeadSha: 'b'.repeat(40),
    });
    expect(projection.verifiedHeadSha).toBe('b'.repeat(40));
    expect(projection.digest).not.toBe(buildBugbotReviewProjection(base).digest);
  });

  it('changes its digest when durable state changes', () => {
    const changed = buildBugbotReviewProjection({
      ...base,
      findings: [{ id: 'a', state: 'fixed' }],
    });
    expect(changed.digest).not.toBe(buildBugbotReviewProjection(base).digest);
  });

  it('never projects an empty partial review as clean or failed', () => {
    const projection = buildBugbotReviewProjection({
      ...base,
      findings: [],
      coverage: {
        status: 'partial',
        sources: [{
          source: 'diff',
          status: 'partial',
          pagesFetched: 10,
          itemsFetched: 1_000,
          itemsRetained: 1_000,
          omittedItems: 0,
          truncatedItems: 0,
          limitReached: true,
        }],
      },
    });
    expect(projection.outcome).toBe('partial');
  });
});
