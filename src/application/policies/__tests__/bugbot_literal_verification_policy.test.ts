import type { BugbotFinding } from '../../../domain/bugbot/finding';
import {
  applyLiteralVerification, assertLiteralVerificationPrompt, literalVerificationId,
  MAX_LITERAL_VERIFICATION_CANDIDATES, MAX_LITERAL_VERIFICATION_CANDIDATE_BYTES,
  MAX_LITERAL_VERIFICATION_PROMPT_BYTES,
} from '../bugbot_literal_verification_policy';

const id = 'a'.repeat(64);
const finding = (overrides: Partial<BugbotFinding> = {}): BugbotFinding => ({
  id: 'candidate', title: 'Counter mismatch', description: 'The changed assertion contradicts its executed line.',
  file: 'coverage/fixture.py', line: 18, codeSnippet: 'assert rows[6]["ci"] == 0',
  evidence: 'The source witness places the exercised positive return on line 6.', ...overrides,
});

it('binds verification to source and candidate values', () => {
  const first = literalVerificationId('source-a', [finding()]);
  expect(first).toMatch(/^[a-f0-9]{64}$/u);
  expect(literalVerificationId('source-a', [finding()])).toBe(first);
  expect(literalVerificationId('source-b', [finding()])).not.toBe(first);
  expect(literalVerificationId('source-a', [finding({ description: 'different proof' })])).not.toBe(first);
});

it('rejects an original candidate count beyond the fixed cap', () => {
  expect(() => literalVerificationId('source', Array.from({ length: MAX_LITERAL_VERIFICATION_CANDIDATES + 1 },
    (_, index) => finding({ id: String(index) })))).toThrow('20');
});

it('rejects duplicate original identities before querying', () => {
  expect(() => literalVerificationId('source', [finding(), finding()])).toThrow();
});

it('rejects an empty original candidate identity', () => {
  expect(() => literalVerificationId('source', [finding({ id: '' })])).toThrow();
});

it('rejects an empty verification candidate set', () => {
  expect(() => literalVerificationId('source', [])).toThrow();
});

it('bounds candidate data in UTF-8 bytes before building a prompt', () => {
  expect(() => literalVerificationId('source', [finding({ evidence: 'Ω'.repeat(MAX_LITERAL_VERIFICATION_CANDIDATE_BYTES / 2) })])).toThrow();
});

it.each([false, true])('enforces the complete prompt byte ceiling, overflow=%s', overflow => {
  const prompt = 'Ω'.repeat(MAX_LITERAL_VERIFICATION_PROMPT_BYTES / 2) + (overflow ? 'a' : '');
  if (overflow) expect(() => assertLiteralVerificationPrompt(prompt)).toThrow();
  else expect(() => assertLiteralVerificationPrompt(prompt)).not.toThrow();
});

it('retains same-statement corrections and rejects unsupported candidates without mutation', () => {
  const original = Object.freeze([Object.freeze(finding()), Object.freeze(finding({ id: 'unsupported' }))]);
  const corrected = finding({ line: 19, description: 'Corrected source-bound explanation.' });
  expect(applyLiteralVerification(id, id, original, [corrected], ['unsupported'])).toEqual([corrected]);
  expect(original[0].line).toBe(18);
});

it.each([
  ['wrong correlation', 'b'.repeat(64), [finding()], []],
  ['unknown retained ID', id, [finding({ id: 'unassigned' })], []],
  ['missing decision', id, [], []],
  ['overlapping decision', id, [finding()], ['candidate']],
  ['unknown rejection', id, [], ['unassigned']],
  ['changed file', id, [finding({ file: 'other.py' })], []],
  ['changed code anchor', id, [finding({ codeSnippet: 'assert rows[7]["ci"] == 0' })], []],
  ['missing concrete evidence', id, [finding({ evidence: '' })], []],
] as const)('rejects %s', (_name, observed, retained, rejected) => {
  expect(() => applyLiteralVerification(id, observed, [finding()], retained, rejected)).toThrow();
});

it('rejects duplicate retained decisions', () => {
  expect(() => applyLiteralVerification(id, id, [finding(), finding({ id: 'b' })], [finding(), finding()], [])).toThrow();
});

it('rejects duplicate rejection decisions', () => {
  expect(() => applyLiteralVerification(id, id, [finding(), finding({ id: 'b' })], [], ['candidate', 'candidate'])).toThrow();
});

it('permits a new precise anchor only when the original omitted one', () => {
  expect(applyLiteralVerification(id, id, [finding({ codeSnippet: undefined })], [finding()], [])).toEqual([finding()]);
});

it('treats a prototype-like identity as inert map data', () => {
  const candidate = finding({ id: '__proto__' });
  expect(applyLiteralVerification(id, id, [candidate], [], ['__proto__'])).toEqual([]);
  expect(Object.prototype).not.toHaveProperty('evidence');
});
