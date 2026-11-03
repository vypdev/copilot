import Ajv from 'ajv';
import { buildLiteralVerificationSchema, verifyGeneratedLiteralFindings } from '../../application/usecases/steps/commit/bugbot/verify_generated_literal_findings';
import type { BugbotFinding } from '../../domain/bugbot/finding';
import type { FindingsQueryRequest } from '../../application/ports/agent_findings_ports';

const candidate = (overrides: Partial<BugbotFinding> = {}): BugbotFinding => ({
  id: 'assertion', title: 'Assertion contradicts actual helper values', description: 'A concrete source contradiction.',
  file: 'owned/test_values.py', line: 7, codeSnippet: '+        assert rejected is False',
  evidence: 'Origin 2 + offset 5 = line 7; the helper returns True.', ...overrides,
});
const wire = (value: BugbotFinding) => ({ ...value, file: value.file ?? null, line: value.line ?? null,
  endLine: null, severity: 'medium', confidence: 1, category: 'correctness',
  suggestion: null, symbol: null, codeSnippet: value.codeSnippet ?? null, suggestedCode: null });
const schema = (values: readonly BugbotFinding[]) => buildLiteralVerificationSchema('a'.repeat(64), values);
const validator = (values: readonly BugbotFinding[]) => new Ajv({ allErrors: true })
  .compile(schema(values).properties.findings.items);
const config = { provider: 'codex' as const, model: 'fixture', effort: 'medium' as const };
const response = (request: FindingsQueryRequest, findings: readonly BugbotFinding[]) => ({
  verification_id: (request.options!.schema as ReturnType<typeof buildLiteralVerificationSchema>).properties.verification_id.enum[0],
  outputLocale: 'en-US', findings, rejected_ids: [],
});

it.each([
  ['leading diff marker', '+        assert rejected is False', 'assert rejected is False'],
  ['multiline indentation', '  assert result == (\n      b, a\n  )', 'assert result == (\n b, a\n)'],
])('constrains the native schema to the exact %s while allowing line corrections', (_name, codeSnippet, changed) => {
  const original = candidate({ codeSnippet });
  const validate = validator([original]);
  expect(validate(wire({ ...original, line: 89 }))).toBe(true);
  expect(validate(wire({ ...original, codeSnippet: changed }))).toBe(false);
});

it('rejects an unknown file at the schema boundary', () => {
  expect(validator([candidate()])(wire(candidate({ file: 'other.py' })))).toBe(false);
});

it('deduplicates shared batch file and snippet values without losing original candidate IDs', () => {
  const result = schema([candidate(), candidate({ id: 'other' })]);
  expect(result.properties.findings.items.properties.file.enum).toEqual(['owned/test_values.py']);
  expect(result.properties.findings.items.properties.codeSnippet.enum).toEqual(['+        assert rejected is False']);
  expect(result.properties.findings.items.properties.id.enum).toEqual(['assertion', 'other']);
});

it('retains the existing null wire representation for a candidate without a precise file', () => {
  const original = candidate({ file: undefined });
  expect(schema([original]).properties.findings.items.properties.file.enum).toEqual([null]);
  expect(validator([original])(wire(original))).toBe(true);
});

it('preserves a new precise snippet when an original batch candidate omitted that anchor', () => {
  const original = candidate({ codeSnippet: undefined });
  expect(schema([original]).properties.findings.items.properties.codeSnippet).not.toHaveProperty('enum');
  expect(validator([original])(wire(candidate({ codeSnippet: 'assert reached' })))).toBe(true);
});

it('keeps the application guard against swapping individually allowed batch identities', async () => {
  const first = candidate();
  const second = candidate({ id: 'other', file: 'owned/other.py', codeSnippet: 'assert different' });
  const crossed = { ...first, file: second.file, codeSnippet: second.codeSnippet };
  // Each value belongs to the schema batch; only the per-ID application guard
  // proves identity binding. Schema membership must never replace that guard.
  expect(validator([first, second])(wire(crossed))).toBe(true);
  const agent = { query: jest.fn(async request => response(request, [crossed, second])) };
  await expect(verifyGeneratedLiteralFindings(agent, config, 'immutable source', {
    outputLocale: 'en-US', findings: [first, second], resolved_findings: [],
  }, 'en-US')).rejects.toThrow('changed candidate identity');
});

it('retains precise-anchor enrichment through the actual verifier use case when the original omitted a snippet', async () => {
  const original = candidate({ codeSnippet: undefined });
  const agent = { query: jest.fn(async request => response(request, [candidate()])) };
  const result = await verifyGeneratedLiteralFindings(agent, config, 'immutable source', {
    outputLocale: 'en-US', findings: [original], resolved_findings: [],
  }, 'en-US') as { findings: readonly BugbotFinding[] };
  expect(result.findings[0]).toMatchObject({ id: original.id, codeSnippet: candidate().codeSnippet });
  expect(agent.query).toHaveBeenCalledTimes(1);
});
