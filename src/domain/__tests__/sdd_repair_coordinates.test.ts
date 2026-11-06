import { renderSddDerivedTables, validateSddDraftConsistency } from '../sdd_draft_consistency';
import { SddDraftFormatFailure } from '../pre_branch_sdd';
import { sddConsistencyFixture } from '../../testing/sdd_consistency_fixture';

const raw = () => sddConsistencyFixture()
  .replace(/\| Area \| Minimum distinct cases[\s\S]*?(?=\| Case ID)/u, '{{SDD_CASE_BUDGET}}\n\n')
  .replace(/\| Requirement \| Cases \|[\s\S]*$/u, '{{SDD_REQUIREMENT_CASES}}\n');
const validate = (markdown: string) => validateSddDraftConsistency(markdown, [], {
  files: new Set(['docs/payments.mdx']), directories: new Set(['docs']), blocked: new Set(),
}, 'specs/change.md');
function diagnostic(run: () => unknown) {
  try { run(); throw new Error('Expected format rejection'); }
  catch (error) {
    expect(error).toBeInstanceOf(SddDraftFormatFailure);
    const facts = (error as SddDraftFormatFailure).diagnostic.facts;
    expect(JSON.stringify(facts)).not.toMatch(/G-\d|payments|PRIVATE/u);
    return facts;
  }
}

it.each(['assembly', 'validation'] as const)('sdd-feedback-C01/C02: locates the second case with an undefined requirement during %s', phase => {
  const markdown = (phase === 'assembly' ? raw() : sddConsistencyFixture())
    .replace('C02 | Policy | G-01 |', 'C02 | Policy | G-99 |');
  expect(diagnostic(() => phase === 'assembly' ? renderSddDerivedTables(markdown) : validate(markdown)))
    .toContainEqual({ detail: 'requirement-reference', section: 14, row: 2, expected: 0, observed: 1 });
});
it.each(['assembly', 'validation'] as const)('sdd-feedback-C03/C04: locates an uncovered goal without inventing edges during %s', phase => {
  const markdown = (phase === 'assembly' ? raw() : sddConsistencyFixture())
    .replace('C03 | Adapter | G-02 |', 'C03 | Adapter | G-01 |');
  const facts = diagnostic(() => phase === 'assembly' ? renderSddDerivedTables(markdown) : validate(markdown));
  expect(facts).toContainEqual({ detail: 'requirement-coverage', section: 17, expected: 0, observed: 1 });
  expect(facts).toContainEqual({ detail: 'requirement-coverage', section: 4, row: 2, expected: 1, observed: 0 });
});
it('sdd-feedback-C05: distinguishes a missing raw budget slot from wrong allocation arithmetic', () => {
  expect(diagnostic(() => renderSddDerivedTables(raw().replace('{{SDD_CASE_BUDGET}}', ''))))
    .toEqual([{ detail: 'derived-slot-count', section: 14, expected: 1, observed: 0 }]);
});
it('sdd-feedback-C06: counts a hidden duplicate slot without reading its private context into feedback', () => {
  expect(diagnostic(() => renderSddDerivedTables(raw() + '\n<!-- PRIVATE {{SDD_CASE_BUDGET}} -->')))
    .toEqual([{ detail: 'derived-slot-count', section: 14, expected: 1, observed: 2 }]);
});
it('sdd-feedback-C07: reports a unique slot in the wrong section as a placement failure', () => {
  const markdown = raw().replace('{{SDD_CASE_BUDGET}}', '').replace('## 17.', '{{SDD_CASE_BUDGET}}\n## 17.');
  expect(diagnostic(() => renderSddDerivedTables(markdown)))
    .toEqual([{ detail: 'derived-slot-placement', section: 14, expected: 1, observed: 0 }]);
});
it('sdd-feedback-C08: cannot use a fenced reverse-mapping slot as a visible declaration', () => {
  const markdown = raw().replace('{{SDD_REQUIREMENT_CASES}}', '```text\n{{SDD_REQUIREMENT_CASES}}\n```');
  expect(diagnostic(() => renderSddDerivedTables(markdown)))
    .toEqual([{ detail: 'derived-slot-placement', section: 17, expected: 1, observed: 0 }]);
});
