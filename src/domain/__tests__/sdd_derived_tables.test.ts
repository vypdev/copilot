import { renderSddDerivedTables, validateSddDraftConsistency } from '../sdd_draft_consistency';
import { sddConsistencyFixture } from '../../testing/sdd_consistency_fixture';

const budgetSlot = '{{SDD_CASE_BUDGET}}';
const traceabilitySlot = '{{SDD_REQUIREMENT_CASES}}';
const draft = () => sddConsistencyFixture()
  .replace(/\| Area \| Minimum distinct cases[\s\S]*?(?=\| Case ID)/u, `${budgetSlot}\n\n`)
  .replace(/\| Requirement \| Cases \|[\s\S]*$/u, `${traceabilitySlot}\n`);
const inventory = { files: new Set(['docs/payments.mdx']), directories: new Set(['docs']), blocked: new Set<string>() };
const validate = (markdown: string) => validateSddDraftConsistency(markdown, [], inventory, 'specs/change.md');

describe('SDD derived tables', () => {
  it.each([['invalid legacy draft', 'legacy invalid draft'], ['valid complete draft', sddConsistencyFixture()]])('preserves bytes when slots are absent: %s', (_name, markdown) => {
    expect(renderSddDerivedTables(markdown)).toBe(markdown);
  });

  it('derives exact area counts, total and reciprocal links without changing case definitions', () => {
    const markdown = renderSddDerivedTables(draft());
    expect(markdown).toContain('| Policy | 2 |');
    expect(markdown).toContain('| Adapter | 1 |');
    expect(markdown).toContain('| Total | 3 |');
    expect(markdown).toContain('| G-01 | payments-change-C01, payments-change-C02 |');
    expect(markdown).toContain('| G-02 | payments-change-C03 |');
    expect(markdown).toContain('| payments-change-C03 | Adapter | G-02 | Publishing preserves the principal. |');
    expect(markdown).not.toContain('{{SDD_');
    expect(() => validate(markdown)).not.toThrow();
  });

  it('compiles the 96-case seven-area distribution from #694 without independent arithmetic or reverse edges', () => {
    const areas = [['F', 12], ['N', 14], ['A', 12], ['I', 16], ['V', 14], ['S', 16], ['E', 12]] as const;
    const rows = areas.flatMap(([area, count]) => Array.from({ length: count }, (_, index) =>
      `| browser694-${area}-C${String(index + 1).padStart(2, '0')} | ${area} | G-01, G-02 | Observable ${area} behavior ${index + 1}. |`));
    const source = draft().replace(/\| payments-change-C01[\s\S]*?(?=\n## 15\.)/u, `${rows.join('\n')}\n`);
    const markdown = renderSddDerivedTables(source);
    for (const [area, count] of areas) expect(markdown).toContain(`| ${area} | ${count} |`);
    expect(markdown).toContain('| Total | 96 |');
    const expectedIds = areas.flatMap(([area, count]) => Array.from({ length: count }, (_, index) =>
      `browser694-${area}-C${String(index + 1).padStart(2, '0')}`)).join(', ');
    expect(markdown).toContain(`| G-01 | ${expectedIds} |`);
    expect(markdown).toContain(`| G-02 | ${expectedIds} |`);
    expect(() => validate(markdown)).not.toThrow();
  });

  it('keeps a multi-requirement case in each reverse mapping and counts it only once', () => {
    const markdown = renderSddDerivedTables(draft().replace('| Adapter | G-02 |', '| Adapter | G-01, G-02 |'));
    expect(markdown).toContain('| G-01 | payments-change-C01, payments-change-C02, payments-change-C03 |');
    expect(markdown).toContain('| Total | 3 |');
    expect(() => validate(markdown)).not.toThrow();
  });

  it('handles CRLF and emphasized definition cells through the same visible-table parser', () => {
    const markdown = renderSddDerivedTables(draft().replace('| Policy | G-01 |', '| **Policy** | `G-01` |').replace(/\n/gu, '\r\n'));
    expect(markdown).toContain('| Policy | 2 |');
    expect(() => validate(markdown)).not.toThrow();
  });

  it.each([
    ['missing budget', (s: string) => s.replace(budgetSlot, ''), 'case-budget'],
    ['missing reverse links', (s: string) => s.replace(traceabilitySlot, ''), 'requirement-mapping'],
    ['duplicate budget', (s: string) => s.replace(budgetSlot, `${budgetSlot}\n${budgetSlot}`), 'case-budget'],
    ['duplicate reverse links', (s: string) => s.replace(traceabilitySlot, `${traceabilitySlot}\n${traceabilitySlot}`), 'requirement-mapping'],
    ['hidden duplicate budget', (s: string) => `${s}\n<!-- ${budgetSlot} -->`, 'case-budget'],
    ['hidden duplicate reverse links', (s: string) => `${s}\n<!-- ${traceabilitySlot} -->`, 'requirement-mapping'],
    ['wrong budget section', (s: string) => s.replace(budgetSlot, '').replace(traceabilitySlot, `${budgetSlot}\n${traceabilitySlot}`), 'case-budget'],
    ['wrong reverse section', (s: string) => s.replace(traceabilitySlot, '').replace(budgetSlot, `${budgetSlot}\n${traceabilitySlot}`), 'requirement-mapping'],
    ['fenced budget', (s: string) => s.replace(budgetSlot, `\`\`\`text\n${budgetSlot}\n\`\`\``), 'case-budget'],
    ['fenced reverse links', (s: string) => s.replace(traceabilitySlot, `~~~text\n${traceabilitySlot}\n~~~`), 'requirement-mapping'],
    ['commented budget', (s: string) => s.replace(budgetSlot, `<!-- ${budgetSlot} -->`), 'case-budget'],
    ['commented reverse links', (s: string) => s.replace(traceabilitySlot, `<!-- ${traceabilitySlot} -->`), 'requirement-mapping'],
    ['inline budget', (s: string) => s.replace(budgetSlot, `Example ${budgetSlot}`), 'case-budget'],
    ['inline reverse links', (s: string) => s.replace(traceabilitySlot, `Example ${traceabilitySlot}`), 'requirement-mapping'],
  ] as const)('rejects %s instead of interpreting an example or hiding a declaration', (_name, mutate, reason) => {
    expect(() => renderSddDerivedTables(mutate(draft()))).toThrow(expect.objectContaining({ reason }));
  });

  it.each([
    ['missing requirements', (s: string) => s.replace('Requirement | Behavior', 'Goal | Behavior'), 'requirement-mapping'],
    ['duplicate requirements', (s: string) => s.replace('| G-02 | Preserve', '| G-01 | Preserve'), 'requirement-mapping'],
    ['invalid requirement ID', (s: string) => s.replace(/G-02/gu, 'goal'), 'requirement-mapping'],
    ['missing inventory', (s: string) => s.replace('Case ID | Area', 'Test | Area'), 'case-identity'],
    ['malformed inventory', (s: string) => s.replace('|---|---|---|---|', '|---|---|bad|---|'), 'case-identity'],
    ['duplicate cases', (s: string) => s.replace(/payments-change-C02/gu, 'payments-change-C01'), 'case-identity'],
    ['shorthand case', (s: string) => s.replace(/payments-change-C02/gu, 'C02'), 'case-identity'],
    ['undefined requirement', (s: string) => s.replace('| Adapter | G-02 |', '| Adapter | G-09 |'), 'requirement-mapping'],
    ['duplicate edge', (s: string) => s.replace('| Adapter | G-02 |', '| Adapter | G-02, G-02 |'), 'requirement-mapping'],
    ['uncovered requirement', (s: string) => s.replace('| Adapter | G-02 |', '| Adapter | G-01 |'), 'requirement-mapping'],
    ['reserved total area', (s: string) => s.replace('| Adapter | G-02 |', '| Total | G-02 |'), 'case-budget'],
  ] as const)('rejects %s without inventing, dropping or relabeling a definition', (_name, mutate, reason) => {
    expect(() => renderSddDerivedTables(mutate(draft()))).toThrow(expect.objectContaining({ reason }));
  });

  it.each([
    ['contradictory supplied budget', (s: string) => s.replace(budgetSlot, `${budgetSlot}\n| Area | Minimum distinct cases | Behaviors/risks covered |\n|---|---|---|\n| Total | 1 | Wrong |`), 'case-budget'],
    ['contradictory supplied reverse links', (s: string) => s.replace(traceabilitySlot, `${traceabilitySlot}\n| Requirement | Cases |\n|---|---|\n| G-01 | payments-change-C03 |`), 'requirement-mapping'],
    ['missing immutable path', (s: string) => s.replace('docs/payments.mdx', 'docs/absent.mdx'), 'repository-path'],
    ['bare case alias in prose', (s: string) => `${s}\nSee C03.`, 'case-identity'],
  ] as const)('preserves the writer rejection for %s', (_name, mutate, reason) => {
    expect(() => validate(renderSddDerivedTables(mutate(draft())))).toThrow(expect.objectContaining({ reason }));
  });

  it('does not authorize a case identity reserved by an immutable owner', () => {
    const markdown = renderSddDerivedTables(draft());
    expect(() => validateSddDraftConsistency(markdown,
      [{ path: 'specs/owner.md', markdown: 'payments-change-C01 already owns a different behavior.' }], inventory, 'specs/change.md'))
      .toThrow(expect.objectContaining({ reason: 'case-identity' }));
  });
});
