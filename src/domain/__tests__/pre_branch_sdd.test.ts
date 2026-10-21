import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSafeSddPath,
  parseSddAnswer,
  parseSddPlan,
  readSddGateRecord,
  renderSddGateRecord,
  validateSddMarkdown,
  composeSddUpdate,
  normalizeSddIssueTitle,
  retainSddAnswers,
  SddOwnerFormatFailure,
  SddOwnershipFailure,
  type SddGateRecord,
} from '../pre_branch_sdd';

const catalog = new Map([['payments', ['specs/payments.md']]]);
const reason = 'This issue changes the payments contract and requires an owner update.';
const plan = { action: 'update', path: 'specs/payments.md', capabilityId: 'payments', reason, questions: [] };

describe('pre-branch SDD policy', () => {
  function validDocument(title: string, extra = ''): string {
    return `# ${title}\n${'Existing scope and authorization remain required. '.repeat(45)}\n## 1. Executive summary\n## 4. Goals\n## 8. Clean Architecture\n## 14. Testing strategy\n20 distinct cases\n## 16. Acceptance\n${extra}`;
  }

  it('preserves the existing contract and appends an isolated proposed change without altering code examples', () => {
    const existing = validDocument('Original owner', 'The original feature MUST remain authorized.');
    const change = validDocument('Status extension', '```markdown\n## Example heading\n```\n');
    const merged = composeSddUpdate(existing, change);
    expect(merged.startsWith(`${existing}\n\n`)).toBe(true);
    expect(merged).toContain('## Status extension');
    expect(merged).toContain('### 16. Acceptance');
    expect(merged).toContain('```markdown\n## Example heading\n```');
  });

  it('rejects an oversized change appendix without dropping any existing requirement', () => {
    expect(() => composeSddUpdate(validDocument('Owner'), validDocument('Change', 'x'.repeat(18_000))))
      .toThrow('appendix exceeds 18000');
  });

  it('rejects a combined owner beyond the fixed document limit instead of truncating it', () => {
    expect(() => composeSddUpdate(validDocument('Owner', 'x'.repeat(60_000)), validDocument('Change', 'x'.repeat(10_000))))
      .toThrow('length is outside');
  });

  it.each(['specs/payments.md', 'specs/new-capability.md'])('allows one normalized SDD path %s', path => {
    expect(isSafeSddPath(path)).toBe(true);
  });
  it.each(['../README.md', 'specs/../README.md', 'specs/CATALOG.md', 'specs/_template.md', 'src/feature.md', 'specs/x.mdx', 'specs/My-Doc.md'])('rejects path %s', path => {
    expect(isSafeSddPath(path)).toBe(false);
  });
  it('accepts the existing catalog owner', () => {
    expect(parseSddPlan(plan, catalog)).toMatchObject(plan);
  });
  it('ignores the Action title decoration while preserving human title changes', () => {
    expect(normalizeSddIssueTitle('🧑‍💻 - 1.2.3 - Change payments')).toBe('Change payments');
    expect(normalizeSddIssueTitle('Change refunds')).not.toBe(normalizeSddIssueTitle('Change payments'));
  });
  it('accepts one new companion for an existing owner', () => {
    expect(parseSddPlan({ ...plan, action: 'companion', path: 'specs/payments-risk.md' }, catalog).action).toBe('companion');
  });
  it('accepts a new capability with a new path', () => {
    expect(parseSddPlan({ ...plan, action: 'new', capabilityId: 'identity', path: 'specs/identity.md' }, catalog).action).toBe('new');
  });
  it.each([
    { action: 'update', path: 'specs/unknown.md' },
    { action: 'companion', path: 'specs/payments.md' },
    { action: 'new', capabilityId: 'payments' },
    { path: 'specs/../outside.md' },
    { reason: 'short' },
    { questions: Array.from({ length: 9 }, (_, i) => ({ id: `Q${i + 1}`, text: 'What should the behavior be?', owner: 'maintainer' })) },
  ])('rejects a plan with inconsistent ownership or bounds: %j', change => {
    expect(() => parseSddPlan({ ...plan, ...change }, catalog)).toThrow();
  });
  it('requires contiguous numbered questions and explicit answer owners', () => {
    expect(() => parseSddPlan({ ...plan, questions: [{ id: 'Q2', text: 'What should the behavior be?', owner: 'maintainer' }] }, catalog)).toThrow();
    expect(parseSddPlan({ ...plan, questions: [{ id: 'Q1', text: 'What should the behavior be?', owner: 'issue-author' }] }, catalog).questions).toHaveLength(1);
  });
  it('accepts only explicit bounded SDD answers', () => {
    expect(parseSddAnswer('SDD Q1: Keep existing behavior\nSDD Q2: New behavior', 'Q1')).toBe('Keep existing behavior');
    expect(parseSddAnswer('Q1: Keep existing behavior', 'Q1')).toBeUndefined();
    expect(parseSddAnswer('SDD Q2: New behavior', 'Q1')).toBeUndefined();
    expect(parseSddAnswer('SDD Q1: no', 'Q1')).toBeUndefined();
  });
  it('roundtrips a bounded question card and rejects another issue number', () => {
    const record: SddGateRecord = {
      version: 1, issueNumber: 42, phase: 'awaiting-answer', issueDigest: 'a'.repeat(64), baseSha: 'b'.repeat(40), round: 1,
      plan: { ...plan, action: 'update', questions: [{ id: 'Q1', text: 'Which behavior should change?', owner: 'maintainer' }] },
    };
    const body = renderSddGateRecord(record);
    expect(body).toContain('SDD Q1: your answer');
    expect(readSddGateRecord(body, 42)).toEqual(record);
    expect(readSddGateRecord(body, 43)).toBeUndefined();
    expect(renderSddGateRecord(record, 'es-ES')).toContain('Estado del SDD');
    expect(renderSddGateRecord(record, 'es-ES')).toContain('SDD Q1: tu respuesta');
  });
  it('escapes untrusted question markup and mentions in the status card', () => {
    const record: SddGateRecord = {
      version: 1, issueNumber: 42, phase: 'awaiting-answer', issueDigest: 'a'.repeat(64), baseSha: 'b'.repeat(40), round: 1,
      plan: { ...plan, action: 'update', questions: [{ id: 'Q1', text: 'Should @team use <script> and [unsafe](https://example.test)?', owner: 'maintainer' }] },
    };
    const rendered = renderSddGateRecord(record);
    expect(rendered).toContain('@\u200Bteam');
    expect(rendered).toContain('&lt;script&gt;');
    expect(rendered).toContain('\\[unsafe\\]');
  });
  it('rejects a published marker without a valid commit SHA', () => {
    const record: SddGateRecord = {
      version: 1, issueNumber: 42, phase: 'published', issueDigest: 'a'.repeat(64), baseSha: 'b'.repeat(40), round: 1,
      plan: { ...plan, action: 'update' }, branchName: 'feature/42-change', commitSha: 'invalid',
    };
    expect(readSddGateRecord(renderSddGateRecord(record), 42)).toBeUndefined();
  });

  it('rejects forged branch, revision, and answer fields in a durable status marker', () => {
    const record: SddGateRecord = {
      version: 1, issueNumber: 42, phase: 'published', issueDigest: 'a'.repeat(64), baseSha: 'b'.repeat(40), round: 1,
      plan: { ...plan, action: 'update' }, branchName: 'feature/42-change', commitSha: 'c'.repeat(40),
    };
    const marker = (change: Record<string, unknown>) => `<!-- copilot:sdd-gate:v1\n${JSON.stringify({ ...record, ...change })}\n-->`;
    expect(readSddGateRecord(marker({ branchName: 'feature/../other' }), 42)).toBeUndefined();
    expect(readSddGateRecord(marker({ revisionSha: 'd'.repeat(40) }), 42)).toBeUndefined();
    expect(readSddGateRecord(marker({ answers: [{ questionId: 'Q1', author: 'alice', commentId: -1, text: 'yes' }] }), 42)).toBeUndefined();
    expect(readSddGateRecord('<!-- copilot:sdd-gate:v1\nnot JSON\n-->', 42)).toBeUndefined();
  });

  it('shows a retained branch and links to the latest verified revision', () => {
    const record: SddGateRecord = {
      version: 1, issueNumber: 42, phase: 'published', issueDigest: 'a'.repeat(64), baseSha: 'b'.repeat(40), round: 2,
      plan: { ...plan, action: 'update' }, branchName: 'feature/42-change', commitSha: 'c'.repeat(40),
      revisionSha: 'd'.repeat(40), revisionBaseSha: 'c'.repeat(40),
    };
    const body = renderSddGateRecord(record, 'en-US', 'https://github.com/acme/repo/issues/42');
    expect(body).toContain(`https://github.com/acme/repo/blob/${record.revisionSha}/${plan.path}`);
    expect(body).toContain(`**Revision:** \`${record.revisionSha}\``);
    expect(readSddGateRecord(body, 42)).toEqual(record);
    expect(renderSddGateRecord({ ...record, phase: 'awaiting-answer' }, 'es-ES')).toContain('Se conservan la rama vinculada');
  });

  it('escapes an untrusted suggested answer without tagging a GitHub user', () => {
    const record: SddGateRecord = {
      version: 1, issueNumber: 42, phase: 'awaiting-answer', issueDigest: 'a'.repeat(64), baseSha: 'b'.repeat(40), round: 1,
      plan: { ...plan, action: 'update', questions: [{ id: 'Q1', text: 'Which behavior should change?', owner: 'issue-author', suggestion: '@team [click](https://example.test)' }] },
    };
    const body = renderSddGateRecord(record, 'es-ES');
    expect(body).toContain('Respuesta sugerida: @\u200Bteam \\[click\\]');
    expect(body).not.toContain('[@team]');
  });
  it('links a verified publication only to the matching HTTPS issue repository', () => {
    const record: SddGateRecord = {
      version: 1, issueNumber: 42, phase: 'published', issueDigest: 'a'.repeat(64), baseSha: 'b'.repeat(40), round: 1,
      plan: { ...plan, action: 'update' }, branchName: 'feature/42-change', commitSha: 'c'.repeat(40),
    };
    const linked = renderSddGateRecord(record, 'es-ES', 'https://github.com/acme/repo/issues/42');
    expect(linked).toContain(`https://github.com/acme/repo/blob/${record.commitSha}/specs/payments.md`);
    expect(linked).toContain('**Enlaces:**');
    expect(renderSddGateRecord(record, 'en-US', 'http://evil.test/acme/repo/issues/42')).not.toContain('evil.test');
    expect(renderSddGateRecord(record, 'en-US', 'https://github.com/acme/repo/issues/43')).not.toContain('**Links:**');
  });
  it('rejects a draft without numbered acceptance, architecture, or numeric test budget', () => {
    expect(() => validateSddMarkdown('# Too short')).toThrow();
    const text = `${'context '.repeat(300)}\n## 1. Executive summary\n## 4. Goals\n## 8. Clean Architecture\n## 14. Testing strategy\n## 16. Acceptance\n`;
    expect(() => validateSddMarkdown(text)).toThrow('numeric test budget');
    expect(() => validateSddMarkdown(`${text}\nAt least 24 distinct cases.`)).not.toThrow();
  });
});

describe('canonical SDD numeric table budgets', () => {
  const rows = '| Pure policy | 3 | Authority |\n| Adapter | 2 | Publication |\n| **Total** | **5** | No double counting |';
  const header = '| Area | Minimum distinct cases | Behaviors/risks covered |\n|---|---:|---|\n';
  const document = (table: string, before = '') => `# Budget\n${'Product scope and executable acceptance. '.repeat(55)}\n## 1. Executive summary\n## 4. Goals\n## 8. Clean Architecture\n${before}\n## 14. Testing strategy and numeric budget\n${table}\n## 16. Acceptance\n`;

  it('accepts the canonical table with formatted allocations and a justified total', () => {
    expect(() => validateSddMarkdown(document(header + rows.replace('| 3 |', '| `3` |')))).not.toThrow();
  });
  it('accepts an equivalent Spanish budget header with positive allocations', () => {
    expect(() => validateSddMarkdown(document(header.replace('Area', 'Área').replace('Minimum distinct cases', 'Casos mínimos') + rows))).not.toThrow();
  });
  it('accepts the real catalogued comment automation owner without requiring invented numeric prose', () => {
    expect(() => validateSddMarkdown(readFileSync(join(__dirname, '../../../specs/comment-automation-and-authorization.md'), 'utf8'))).not.toThrow();
  });
  it.each([
    ['inconsistent total', header + rows.replace('**5**', '**6**')],
    ['placeholder', header + rows.replace('| 3 |', '| <n> |')],
    ['decimal allocation', header + rows.replace('| 3 |', '| 3.0 |')],
    ['negative allocation', header + rows.replace('| 3 |', '| -3 |')],
    ['zero allocation', header + rows.replace('| 3 |', '| 0 |')],
    ['missing total', header + rows.split('\n').slice(0, 2).join('\n')],
    ['duplicate total', header + rows + '\n| Total | 5 | Duplicate |'],
    ['no allocation', header + '| Total | 5 | Unproven |'],
    ['unrelated header', header.replace('Minimum distinct cases', 'Duration') + rows],
    ['missing separator', header.split('\n')[0] + '\n' + rows],
    ['fenced example', '```markdown\n' + header + rows + '\n```'],
    ['later section', 'No budget.\n## 15. Risks\n' + header + rows],
  ])('rejects a table with %s', (_reason, table) => {
    expect(() => validateSddMarkdown(document(table))).toThrow('numeric test budget');
  });
  it('rejects unsafe integer totals rather than rounding their allocations', () => {
    expect(() => validateSddMarkdown(document(header + '| Policy | 9007199254740992 | Scope |\n| Total | 9007199254740992 | Unproven |'))).toThrow('numeric test budget');
  });
  it('preserves positive prose compatibility and rejects a zero test budget', () => {
    expect(() => validateSddMarkdown(document('At least 8 distinct cases.'))).not.toThrow();
    expect(() => validateSddMarkdown(document('0 distinct cases.'))).toThrow('numeric test budget');
  });
  it('keeps immutable owner format failures distinct from a repairable candidate', () => {
    expect(() => composeSddUpdate(document('No budget.'), document(header + rows))).toThrow(SddOwnerFormatFailure);
  });
});

describe('retained SDD answer provenance', () => {
  const answer = { questionId: 'Q1', author: 'alice', commentId: 101, text: 'Keep strict authorization' };
  const record: SddGateRecord = { version: 1, issueNumber: 42, phase: 'awaiting-answer', issueDigest: 'a'.repeat(64), baseSha: 'b'.repeat(40), round: 2,
    plan: { ...plan, action: 'update', questions: [] } };
  const questionText = 'Who may invoke this operation?';

  it('reads new question provenance together with retained legacy answers without guessing their round', () => {
    const answers = [answer, { ...answer, commentId: 102, round: 2, questionText }];
    expect(renderSddGateRecord({ ...record, answers })).toContain('**Clarification round:** 2');
    expect(renderSddGateRecord({ ...record, answers }, 'es-ES')).toContain('**Ronda de aclaración:** 2');
    expect(readSddGateRecord(renderSddGateRecord({ ...record, answers }), 42)?.answers).toEqual(answers);
    expect(readSddGateRecord(renderSddGateRecord({ ...record, answers }), 42)?.answers?.[0].round).toBeUndefined();
  });

  it.each([
    { round: 0, questionText }, { round: 4, questionText }, { round: 1.5, questionText },
    { round: 1 }, { round: 1, questionText: 'short' }, { round: 1, questionText: 'x'.repeat(1001) },
  ])('rejects malformed optional question provenance: %j', fields => {
    expect(readSddGateRecord(renderSddGateRecord({ ...record, answers: [{ ...answer, ...fields }] }), 42)).toBeUndefined();
  });

  it('rejects more than 24 retained answers without dropping any decision', () => {
    const previous = Array.from({ length: 24 }, (_, i) => ({ ...answer, commentId: i + 1 }));
    expect(() => retainSddAnswers(previous, [answer])).toThrow('history exceeds');
    expect(previous).toHaveLength(24);
  });

  it('bounds the encoded history including comment-terminator escapes', () => {
    const previous = Array.from({ length: 12 }, (_, i) => ({ ...answer, commentId: i + 1, text: '<>'.repeat(1400) }));
    expect(() => retainSddAnswers(previous, [])).toThrow('history exceeds');
  });

  it('keeps untrusted answer and question markup inside the hidden record while roundtripping exactly', () => {
    const malicious = { ...answer, text: '--><script>@team</script><!--', round: 1, questionText: 'Should --> @team be displayed?' };
    const rendered = renderSddGateRecord({ ...record, answers: [malicious] });
    expect(rendered).not.toContain('--><script>');
    expect(rendered.match(/-->/g)).toHaveLength(1);
    expect(readSddGateRecord(rendered, 42)?.answers).toEqual([malicious]);
  });
});


it.each([
  ['update-owner-mismatch', { action: 'update', path: 'specs/other.md' }],
  ['companion-owner-unknown', { action: 'companion', capabilityId: 'unknown' }],
  ['companion-path-registered', { action: 'companion' }],
  ['new-owner-registered', { action: 'new' }],
  ['new-path-registered', { action: 'new', capabilityId: 'unknown' }],
])('classifies ownership rejection %s without retaining proposed values', (reason, change) => {
  try { parseSddPlan({ ...plan, ...(change as object) }, catalog); throw new Error('expected rejection'); }
  catch (error) { expect(error).toBeInstanceOf(SddOwnershipFailure); expect(error).toMatchObject({ reason }); }
});
