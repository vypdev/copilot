import type { BugbotFinding } from '../../../domain/bugbot/finding';
import {
  applyLiteralVerification, assertLiteralVerificationPrompt, literalVerificationId,
  MAX_LITERAL_VERIFICATION_CANDIDATES, MAX_LITERAL_VERIFICATION_CANDIDATE_BYTES,
  MAX_LITERAL_VERIFICATION_PROMPT_BYTES, planLiteralVerificationBatches,
  assertLiteralVerificationResponse, MAX_LITERAL_VERIFICATION_RESPONSE_BYTES,
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


describe('bounded whole-response verification planning', () => {
  const candidates = (count: number) => Array.from({ length: count }, (_, index) => finding({ id: `candidate-${index}` }));
  it.each([[1, [1]], [20, [20]], [21, [20, 1]], [200, Array(10).fill(20)]])('retains all %s schema-valid candidates in bounded ordered batches', (count, sizes) => {
    const original = Object.freeze(candidates(count as number).map(item => Object.freeze(item)));
    const plan = planLiteralVerificationBatches(original);
    expect(plan.map(batch => batch.length)).toEqual(sizes);
    expect(plan.flat()).toEqual(original);
    expect(plan[0]).not.toBe(original);
  });
  it.each([0, 201])('rejects %s candidates outside the initial review schema', count => {
    expect(() => planLiteralVerificationBatches(candidates(count))).toThrow('200');
  });
  it('rejects duplicates across separate batches before any queries', () => {
    const original = candidates(21); original[20] = original[0];
    expect(() => planLiteralVerificationBatches(original)).toThrow();
  });
  it('preflights a later oversized batch instead of returning a partial plan', () => {
    const original = candidates(21); original[20].evidence = 'Ω'.repeat(16_000);
    expect(() => planLiteralVerificationBatches(original)).toThrow('32000');
  });
  it('preflights combined UTF-8 size within a full batch', () => {
    expect(() => planLiteralVerificationBatches(candidates(20).map(item => ({ ...item, evidence: 'Ω'.repeat(1_000) })))).toThrow('32000');
  });
  it('keeps prototype-like identities inert across batch boundaries', () => {
    const original = candidates(21); original[20].id = '__proto__';
    expect(planLiteralVerificationBatches(original).flat()).toEqual(original);
  });
});


it.each([['a', 1, false], ['a', 1, true], ['Ω', 2, false], ['Ω', 2, true]] as const)('bounds the separate response envelope for %s (%i UTF-8 bytes), overflow=%s', (character, bytes, overflow) => {
  const value = character.repeat(MAX_LITERAL_VERIFICATION_RESPONSE_BYTES / bytes) + (overflow ? 'x' : '');
  if (overflow) expect(() => assertLiteralVerificationResponse(value)).toThrow('JSON response bound');
  else expect(() => assertLiteralVerificationResponse(value)).not.toThrow();
});
