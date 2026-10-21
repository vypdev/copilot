import { reservedSddCaseIds, validateSddDraftConsistency, type SddConsistencyReason } from '../sdd_draft_consistency';
import { sddConsistencyFixture } from '../../testing/sdd_consistency_fixture';

const inventory = {
  files: new Set(['docs/payments.mdx', 'docs/my_guide.mdx', 'backend/app.kt']),
  directories: new Set(['docs', 'backend']), blocked: new Set(['docs/link', 'submodule']),
};
const owners = [{ path: 'specs/payments.md', markdown: 'payments-C01: Missing bearer returns 401.' },
  { path: 'specs/other.md', markdown: 'payments-session-C09: Expired principal returns 401.' }];
const validate = (markdown: string) => validateSddDraftConsistency(markdown, owners, inventory, 'specs/change.md');

describe('generated SDD consistency', () => {
  it('accepts complete tables with an independently scoped case namespace and exact reverse mappings', () => {
    expect(() => validate(sddConsistencyFixture())).not.toThrow();
  });

  it.each(['omitted', 'reference', 'update'] as const)('rejects a new SDD declared as %s even when a self-link resolves to its path', change => {
    const row = '| specs/change.md | create |';
    const markdown = sddConsistencyFixture().replace(row, change === 'omitted' ? '' : `| specs/change.md | ${change} |`) + '\n[Draft](./change.md)';
    expect(() => validate(markdown)).toThrow(expect.objectContaining({ reason: 'repository-path' }));
  });

  it('accepts a declared update to an immutable existing SDD', () => {
    const existing = { ...inventory, files: new Set([...inventory.files, 'specs/change.md']) };
    expect(() => validateSddDraftConsistency(sddConsistencyFixture('payments-change', 'specs/change.md', 'update'), owners, existing, 'specs/change.md')).not.toThrow();
  });

  it.each(['omitted', 'reference', 'create'] as const)('rejects an existing SDD declared as %s', change => {
    const existing = { ...inventory, files: new Set([...inventory.files, 'specs/change.md']) };
    const markdown = sddConsistencyFixture().replace('| specs/change.md | create |', change === 'omitted' ? '' : `| specs/change.md | ${change} |`);
    expect(() => validateSddDraftConsistency(markdown, owners, existing, 'specs/change.md')).toThrow(expect.objectContaining({ reason: 'repository-path' }));
  });

  it('rejects a canonical table truncated before its separator', () => {
    const markdown = `${sddConsistencyFixture().split('| Requirement | Cases |')[0]}| Requirement | Cases |`;
    expect(() => validate(markdown)).toThrow(expect.objectContaining({ reason: 'requirement-mapping' }));
  });

  it('rejects an empty canonical traceability table', () => {
    const markdown = sddConsistencyFixture().split('| Requirement | Cases |')[0] + '| Requirement | Cases |\n|---|---|\n';
    expect(() => validate(markdown)).toThrow(expect.objectContaining({ reason: 'requirement-mapping' }));
  });

  it('keeps shorter and mismatched fence markers inside the excluded example', () => {
    expect(reservedSddCaseIds([{ path: 'specs/examples.md', markdown: '````md\n```\n~~~\nignored-C01\n````\nretained-C01' }])).toEqual(['retained-C01']);
  });

  it.each([
    ['```', '```not-close'], ['```', '````not-close'], ['```', '``` \ttext'], ['```', '    ```'],
    ['~~~', '~~~not-close'], ['~~~', '~~~~not-close'], ['~~~', '~~~ \ttext'], ['~~~', '    ~~~'],
  ])('does not expose a fenced contract after the invalid closing line %j / %j', (marker, closing) => {
    const markdown = `${marker}md\n${closing}\n${sddConsistencyFixture()}\n${marker}\nretained-C01`;
    expect(() => validate(markdown)).toThrow(expect.objectContaining({ reason: 'requirement-mapping' }));
    expect(reservedSddCaseIds([{ path: 'specs/examples.md', markdown }])).toEqual(['retained-C01']);
  });

  it.each(['```', '~~~'])('accepts a longer %s closing fence with trailing spaces and tabs', marker => {
    const markdown = `${marker}md\nignored-C01\n   ${marker}${marker[0]} \t\n${sddConsistencyFixture()}`;
    expect(() => validate(markdown)).not.toThrow();
  });

  it.each(['```', '~~~'])('does not erase an HTML comment that makes a %s closing fence invalid', marker => {
    const markdown = `${marker}md\n${marker}<!-- not a closing fence -->\n${sddConsistencyFixture()}`;
    expect(() => validate(markdown)).toThrow(expect.objectContaining({ reason: 'requirement-mapping' }));
  });

  it('keeps comment syntax literal inside a fence so it cannot hide the visible contract after the close', () => {
    expect(() => validate('```md\n<!--\n```\n' + sddConsistencyFixture())).not.toThrow();
  });

  it('ignores a fence marker inside an HTML comment without hiding the visible contract after the comment', () => {
    expect(() => validate('<!--\n```md\n-->\n' + sddConsistencyFixture())).not.toThrow();
  });

  it('keeps owner identities around multiple inline comments while excluding their hidden identities', () => {
    const markdown = 'first-C01<!-- hidden-C01 -->middle-C01<!-- hidden-C02 -->final-C01';
    expect(reservedSddCaseIds([{ path: 'specs/examples.md', markdown }])).toEqual(['final-C01', 'first-C01', 'middle-C01']);
  });

  it('does not let an unclosed HTML comment expose its contract', () => {
    expect(() => validate(`<!--\n${sddConsistencyFixture()}`)).toThrow(expect.objectContaining({ reason: 'requirement-mapping' }));
  });

  it.each([
    ['primary collision', (s: string) => s.replace(/payments-change-C01/gu, 'payments-C01')],
    ['companion collision', (s: string) => s.replace(/payments-change-C01/gu, 'payments-session-C09')],
    ['duplicate definition', (s: string) => s.replace(/payments-change-C02/gu, 'payments-change-C01')],
    ['shorthand identity', (s: string) => s.replace(/payments-change-C02/gu, 'C02')],
    ['unknown reference', (s: string) => `${s}\nSee payments-missing-C99.`],
    ['missing inventory', (s: string) => s.replace('Case ID | Area', 'Other ID | Area')],
    ['hidden inventory', (s: string) => s.replace('| Case ID | Area', '<!--\n| Case ID | Area').replace('## 15.', '-->\n## 15.')],
    ['fenced inventory', (s: string) => s.replace('| Case ID | Area', '```md\n| Case ID | Area').replace('## 15.', '```\n## 15.')],
    ['malformed inventory separator', (s: string) => s.replace('|---|---|---|---|', '|---|---|bad|---|')],
    ['empty scenario', (s: string) => s.replace('Missing credentials return 401.', '')],
    ['extra inventory column', (s: string) => s.replace('Missing credentials return 401. |', 'Missing credentials return 401. | extra |')],
  ])('rejects %s before publication', (_name, mutate) => {
    expect(() => validate(mutate(sddConsistencyFixture()))).toThrow(expect.objectContaining({ reason: 'case-identity' }));
  });

  it.each([
    ['offsetting area errors', (s: string) => s.replace('| Policy | 2 |', '| Policy | 1 |').replace('| Adapter | 1 |', '| Adapter | 2 |')],
    ['unknown area', (s: string) => s.replace('| Adapter | G-02 |', '| Browser | G-02 |')],
    ['missing total', (s: string) => s.replace('| **Total** | **3** | No double counting |', '')],
    ['incorrect total', (s: string) => s.replace('**3**', '**4**')],
    ['zero allocation', (s: string) => s.replace('| Policy | 2 |', '| Policy | 0 |')],
    ['placeholder count', (s: string) => s.replace('| Policy | 2 |', '| Policy | <n> |')],
    ['unsafe integer', (s: string) => s.replace('| Policy | 2 |', '| Policy | 9007199254740992 |')],
    ['duplicate area', (s: string) => s.replace('| Adapter | 1 |', '| Policy | 1 |')],
    ['row after total', (s: string) => s.replace('| **Total** | **3** | No double counting |', '| **Total** | **3** | No double counting |\n| Extra | 1 | Duplicate |')],
    ['prose bypass', (s: string) => s.replace('Minimum distinct cases', 'Unknown budget') + '\nAt least 3 distinct cases.'],
    ['duplicate budget', (s: string) => s.replace('## 16.', '## 14. Testing strategy\n## 16.')],
  ])('rejects %s even if numeric prose or the grand total appears valid', (_name, mutate) => {
    const reason = _name === 'duplicate budget' ? 'case-identity' : 'case-budget';
    expect(() => validate(mutate(sddConsistencyFixture()))).toThrow(expect.objectContaining({ reason }));
  });

  it.each([
    ['one-sided requirement', (s: string) => s.replace('| G-02 | payments-change-C03 |', '| G-02 | payments-change-C02 |')],
    ['undefined requirement', (s: string) => s.replace('| Adapter | G-02 |', '| Adapter | G-09 |')],
    ['missing requirement coverage', (s: string) => s.replace('| G-02 | Preserve', '| G-09 | Preserve')],
    ['generic documentation check', (s: string) => s.replace('| G-02 | payments-change-C03 |', '| G-02 | documentation check |')],
    ['undefined case', (s: string) => s.replace('| G-02 | payments-change-C03 |', '| G-02 | C03 |')],
    ['duplicate mapping', (s: string) => s.replace('| G-02 | payments-change-C03 |', '| G-01 | payments-change-C03 |')],
    ['duplicate goal', (s: string) => s.replace('| G-02 | Preserve', '| G-01 | Preserve')],
    ['duplicate case requirement', (s: string) => s.replace('| Policy | G-01 |', '| Policy | G-01, G-01 |')],
    ['empty reverse links', (s: string) => s.replace('| G-02 | payments-change-C03 |', '')],
    ['missing requirement table', (s: string) => s.replace('| Requirement | Behavior |', '| Goal | Behavior |')],
    ['uncovered goal', (s: string) => s.replace('| G-02 | Preserve the accepted principal through publication. |', '| G-02 | Preserve the accepted principal through publication. |\n| G-03 | Describe recovery. |')],
    ['missing traceability table', (s: string) => s.replace('| Requirement | Cases |', '| Requirement | Evidence |')],
  ])('rejects %s', (_name, mutate) => {
    const reason = _name === 'undefined case' ? 'case-identity' : 'requirement-mapping';
    expect(() => validate(mutate(sddConsistencyFixture()))).toThrow(expect.objectContaining({ reason }));
  });

  it.each([
    ['nonexistent update', (s: string) => s.replace('docs/payments.mdx', 'docs/cloud-development-environment.md')],
    ['existing file declared new', (s: string) => s.replace('| update |', '| create |')],
    ['directory as file', (s: string) => s.replace('docs/payments.mdx', 'docs')],
    ['unsupported action', (s: string) => s.replace('| update |', '| someday |')],
    ['duplicate path', (s: string) => s.replace('| docs/payments.mdx | update |', '| docs/payments.mdx | update |\n| docs/payments.mdx | reference |')],
    ['traversal in table', (s: string) => s.replace('docs/payments.mdx', '../outside.mdx')],
    ['undeclared new citation', (s: string) => `${s}\nUpdate \`docs/missing.mdx\`.`],
    ['unformatted missing citation', (s: string) => `${s}\nUpdate docs/missing.mdx.`],
    ['unknown relative link', (s: string) => `${s}\n[Guide](../docs/missing.mdx)`],
    ['escaping link', (s: string) => `${s}\n[Guide](../../outside.mdx)`],
    ['invalid encoded link', (s: string) => `${s}\n[Guide](%broken)`],
    ['backslash path', (s: string) => s.replace('docs/payments.mdx', 'docs\\payments.mdx')],
    ['symlink proposal', (s: string) => s.replace('| docs/payments.mdx | update |', '| docs/link/new.md | create |')],
    ['submodule proposal', (s: string) => s.replace('| docs/payments.mdx | update |', '| submodule/new.md | create |')],
    ['file as parent', (s: string) => s.replace('| docs/payments.mdx | update |', '| backend/app.kt/new.md | create |')],
  ])('rejects %s against the immutable inventory', (_name, mutate) => {
    expect(() => validate(mutate(sddConsistencyFixture()))).toThrow(expect.objectContaining({ reason: 'repository-path' }));
  });

  it('allows intentional new files, relative file links, language-neutral paths, directories and external links', () => {
    const markdown = sddConsistencyFixture().replace('| docs/payments.mdx | update |', '| docs/new_guide.md | create |\n| backend/app.kt | reference |')
      + '\nSee `docs/new_guide.md`, `docs/my_guide.mdx`, `backend/`, `plain-text`, `/api/session`, `node command /path`, [self](./change.md), [existing](../docs/payments.mdx#intro), [same](#scope), [proposed](../docs/new_guide.md), [provider](https://example.test/path/file.md) and the retained payments-C01.';
    expect(() => validate(markdown)).not.toThrow();
  });

  it('reserves cases from every owner without treating hidden or fenced examples as definitions', () => {
    expect(reservedSddCaseIds([...owners, { path: 'specs/examples.md', markdown: '<!-- hidden-C01 -->\n```md\nexample-C01\n```' }]))
      .toEqual(['payments-C01', 'payments-session-C09']);
  });

  it('does not let a duplicate canonical inventory prove a single contract', () => {
    const markdown = sddConsistencyFixture().replace('## 15.', '| Case ID | Area | Requirements | Scenario |\n|---|---|---|---|\n| payments-extra-C01 | Policy | G-01 | Another case. |\n\n## 15.');
    expect(() => validate(markdown)).toThrow(expect.objectContaining({ reason: 'case-identity' satisfies SddConsistencyReason }));
  });

  it('reconciles shorthand legacy inventory rows against their fully qualified namespace', () => {
    expect(reservedSddCaseIds([{ path: 'specs/legacy.md', markdown: 'identity-access-C01 missing bearer; C02 invalid claims; C03 expired session.' }]))
      .toEqual(['identity-access-C01', 'identity-access-C02', 'identity-access-C03']);
  });

  it('reserves intermediate cases in a legacy shorthand range', () => {
    expect(reservedSddCaseIds([{ path: 'specs/legacy.md', markdown: 'identity-access-C01; C02–C05.' }]))
      .toEqual(['identity-access-C01', 'identity-access-C02', 'identity-access-C03', 'identity-access-C04', 'identity-access-C05']);
  });

  it('blocks an unreconcilable owner range rather than truncating its reservation', () => {
    expect(() => reservedSddCaseIds([{ path: 'specs/legacy.md', markdown: 'identity-access-C01; C02–C99999.' }])).toThrow('review the baseline');
  });
});
