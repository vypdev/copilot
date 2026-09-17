import {
  isSafeSddPath,
  parseSddAnswer,
  parseSddPlan,
  readSddGateRecord,
  renderSddGateRecord,
  validateSddMarkdown,
  normalizeSddIssueTitle,
  type SddGateRecord,
} from '../pre_branch_sdd';

const catalog = new Map([['payments', ['specs/payments.md']]]);
const reason = 'This issue changes the payments contract and requires an owner update.';
const plan = { action: 'update', path: 'specs/payments.md', capabilityId: 'payments', reason, questions: [] };

describe('pre-branch SDD policy', () => {
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
