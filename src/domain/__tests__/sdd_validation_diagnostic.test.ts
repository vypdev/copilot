import { normalizeSddValidationDiagnostic, type SddValidationDiagnostic } from '../sdd_validation_diagnostic';
import { SddDraftFormatFailure, SDD_REQUIRED_HEADINGS, validateSddMarkdown } from '../pre_branch_sdd';
import { validateSddDraftConsistency } from '../sdd_draft_consistency';
import { sddConsistencyFixture } from '../../testing/sdd_consistency_fixture';

const valid = (): SddValidationDiagnostic => ({ reason: 'requirement-mapping', phase: 'validation',
  facts: [{ detail: 'traceability-links', section: 17, row: 1, expected: 2, observed: 1 }] });

describe('bounded public SDD diagnostics', () => {
  it.each(SDD_REQUIRED_HEADINGS)('reports the actual missing canonical heading ordinal: %s', heading => {
    const markdown = SDD_REQUIRED_HEADINGS.filter(value => value !== heading).join('\n') + '\n3 distinct cases\n' + 'Scope. '.repeat(400);
    try { validateSddMarkdown(markdown); throw new Error('Expected rejection'); }
    catch (error) {
      expect(error).toBeInstanceOf(SddDraftFormatFailure);
      expect((error as SddDraftFormatFailure).diagnostic).toEqual({ reason: 'required-heading', phase: 'validation',
        facts: [{ detail: 'required-heading', section: 0, row: SDD_REQUIRED_HEADINGS.indexOf(heading) + 1 }] });
    }
  });

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


describe('precise failing SDD facts (#714)', () => {
  it.each([
    ['budget without area allocations', (s: string) => s.replace('| Policy | 2 | Authentication |\n', '').replace('| Adapter | 1 | Publication |\n', ''), { detail: 'budget-total', section: 14, expected: 1, observed: 0 }],
    ['sum beyond diagnostic count bound', (s: string) => s.replace('| Policy | 2 |', '| Policy | 100001 |'), { detail: 'budget-total', section: 14, expected: 3 }],
    ['requirement with no inventory case', (s: string) => s.replace('C03 | Adapter | G-02 |', 'C03 | Adapter | G-01 |'), { detail: 'requirement-coverage', section: 17, expected: 0, observed: 1 }],
    ['invalid case identity', (s: string) => s.replace(/payments-change-C01/gu, 'PRIVATE_CASE'), { detail: 'identifier-list', section: 14, row: 1, expected: 0, observed: 1 }],
    ['invalid requirement identity', (s: string) => s.replace(/G-01/gu, 'PRIVATE_REQ'), { detail: 'identifier-list', section: 4, row: 1, expected: 0, observed: 1 }],
    ['duplicate requirement', (s: string) => s.replace(/G-02/gu, 'G-01'), { detail: 'requirement-identity', section: 4, expected: 2, observed: 1 }],
    ['shorthand prose reference', (s: string) => s + '\nSee C01.', { detail: 'case-shorthand', section: 0, expected: 0, observed: 1 }],
    ['invalid inventory requirement list', (s: string) => s.replace('C01 | Policy | G-01 |', 'C01 | Policy | PRIVATE_REQ |'), { detail: 'identifier-list', section: 14, observed: 1 }],
    ['equal-count wrong members', (s: string) => s.replace('G-01 | payments-change-C01, payments-change-C02', 'G-01 | payments-change-C01, payments-change-C03'), { detail: 'traceability-membership', section: 17, row: 1, expected: 0, observed: 2 }],
    ['unknown reverse requirement', (s: string) => s.replace('G-01 | payments-change-C01, payments-change-C02', 'G-99 | payments-change-C01, payments-change-C02'), { detail: 'traceability-requirement', section: 17, row: 1, expected: 0, observed: 1 }],
    ['unknown budget area', (s: string) => s.replace('C03 | Adapter |', 'C03 | PRIVATE_AREA |'), { detail: 'budget-area', section: 14, expected: 0, observed: 1 }],
    ['inconsistent sum', (s: string) => s.replace('| Policy | 2 |', '| Policy | 3 |'), { detail: 'budget-total', section: 14, expected: 3, observed: 4 }],
    ['unknown documentation operation', (s: string) => s.replace('| docs/payments.mdx | update |', '| docs/payments.mdx | delete |'), { detail: 'path-operation', section: 15, row: 1 }],
    ['overlapping proposed paths', (s: string) => s.replace('| specs/change.md | create |', '| specs/change.md | create |\n| specs/change.md/child | create |'), { detail: 'create-path-overlap', section: 15, row: 3 }],
    ['blocked proposed parent', (s: string) => s.replace('| specs/change.md | create |', '| specs/change.md | create |\n| docs/payments.mdx/child | create |'), { detail: 'create-path-parent', section: 15, row: 3 }],
    ['invalid relative link', (s: string) => s + '\n[reference](%ZZ)', { detail: 'path-link', section: 0 }],
    ['missing prose reference', (s: string) => s + '\nInspect `docs/PRIVATE.mdx`.', { detail: 'path-reference', section: 0 }],
  ] as const)('reports the actual failing constraint for %s', (_label, change, fact) => {
    try {
      validateSddDraftConsistency(change(sddConsistencyFixture()), [], {
        files: new Set(['docs/payments.mdx']), directories: new Set(['docs']), blocked: new Set(),
      }, 'specs/change.md');
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(SddDraftFormatFailure);
      expect((error as SddDraftFormatFailure).diagnostic.facts).toContainEqual(expect.objectContaining(fact));
      expect(JSON.stringify((error as SddDraftFormatFailure).diagnostic)).not.toContain('PRIVATE');
      if (_label === 'sum beyond diagnostic count bound') expect((error as SddDraftFormatFailure).diagnostic.facts[0]).not.toHaveProperty('observed');
    }
  });
});
