import { normalizeSddValidationDiagnostic, type SddValidationDiagnostic } from '../sdd_validation_diagnostic';
import { SddDraftFormatFailure } from '../pre_branch_sdd';
import { validateSddDraftConsistency } from '../sdd_draft_consistency';
import { sddConsistencyFixture } from '../../testing/sdd_consistency_fixture';

const valid = (): SddValidationDiagnostic => ({ reason: 'requirement-mapping', phase: 'validation',
  facts: [{ detail: 'traceability-links', section: 17, row: 1, expected: 2, observed: 1 }] });

describe('bounded public SDD diagnostics', () => {
  it('copies and freezes the exact allowed structure', () => {
    const input = valid();
    const result = normalizeSddValidationDiagnostic(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result.facts[0]).not.toBe(input.facts[0]);
    expect([result, result.facts, result.facts[0]].every(Object.isFrozen)).toBe(true);
  });

  it.each([
    null, [], {}, { ...valid(), raw: 'PRIVATE_CANDIDATE' }, { ...valid(), reason: 'PRIVATE' },
    { ...valid(), phase: 'PRIVATE' }, { ...valid(), facts: null }, { ...valid(), facts: [] },
    { ...valid(), facts: Array.from({ length: 9 }, () => valid().facts[0]) },
  ])('rejects unknown or unbounded diagnostic envelopes: %j', input => {
    expect(() => normalizeSddValidationDiagnostic(input as never)).toThrow();
  });

  it.each([
    null, [], {}, { detail: 'PRIVATE', section: 14 }, { detail: 'table-count', section: 99 },
    { detail: 'table-count', section: 14, raw: 'PRIVATE' },
    { detail: 'table-count', section: 14, row: 0 }, { detail: 'table-count', section: 14, row: '1' },
    { detail: 'table-count', section: 14, row: 100001 }, { detail: 'table-count', section: 14, row: 1.5 },
    { detail: 'table-count', section: 14, expected: -1 }, { detail: 'table-count', section: 14, expected: Number.MAX_SAFE_INTEGER },
    { detail: 'table-count', section: 14, observed: NaN }, { detail: 'table-count', section: 14, observed: 'PRIVATE' },
  ])('rejects content-bearing or invalid ordinal/count facts: %j', fact => {
    expect(() => normalizeSddValidationDiagnostic({ ...valid(), facts: [fact] } as never)).toThrow();
  });

  it('retains bounds and rejects a forged reason mismatch on typed content errors', () => {
    expect(() => new SddDraftFormatFailure('case-identity', 'Private', valid())).toThrow('does not match');
    expect(normalizeSddValidationDiagnostic({ reason: 'size', phase: 'response',
      facts: Array.from({ length: 8 }, () => ({ detail: 'size-limit', section: 0, expected: 100000, observed: 0 })) }))
      .toMatchObject({ facts: expect.any(Array) });
  });

  it.each([
    ['unknown requirement', (s: string) => s.replace('C01 | Policy | G-01 |', 'C01 | Policy | PRIVATE-01 |'), 'requirement-reference', 14],
    ['reverse link mismatch', (s: string) => s.replace('G-01 | payments-change-C01, payments-change-C02', 'G-01 | payments-change-C01'), 'traceability-links', 17],
    ['duplicate case', (s: string) => s.replace(/payments-change-C02/gu, 'payments-change-C01'), 'case-identity', 14],
    ['owner collision', (s: string) => s.replace(/payments-change-C01/gu, 'retained-C01'), 'case-reserved', 14],
    ['incorrect total', (s: string) => s.replace('**3**', '**4**'), 'budget-total', 14],
    ['unverified owner path', (s: string) => s.replace('| specs/change.md | create |', ''), 'owner-path', 15],
    ['missing goals section', (s: string) => s.replace('## 4. Goals', '## 3. Other'), 'section-count', 4],
  ] as const)('reports concrete evidence for %s without copying candidate text', (_label, change, detail, section) => {
    try {
      validateSddDraftConsistency(change(sddConsistencyFixture()) + '\nPRIVATE_SOURCE @actor <!-- unsafe -->',
        [{ path: 'specs/owner.md', markdown: 'retained-C01' }],
        { files: new Set(['docs/payments.mdx']), directories: new Set(['docs']), blocked: new Set() }, 'specs/change.md');
      throw new Error('Expected validation rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(SddDraftFormatFailure);
      expect((error as SddDraftFormatFailure).diagnostic.facts).toContainEqual(expect.objectContaining({ detail, section }));
      expect(JSON.stringify((error as SddDraftFormatFailure).diagnostic)).not.toMatch(/PRIVATE|retained-C01|payments-change|@actor|unsafe/u);
    }
  });
});
