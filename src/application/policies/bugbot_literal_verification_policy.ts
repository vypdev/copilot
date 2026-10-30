import type { BugbotFinding } from '../../domain/bugbot/finding';
import { createHash } from 'node:crypto';
import { ApplicationError } from '../errors/application_error';

export const MAX_LITERAL_VERIFICATION_CANDIDATES = 20;
export const MAX_LITERAL_VERIFICATION_CANDIDATE_BYTES = 32_000;
export const MAX_LITERAL_VERIFICATION_PROMPT_BYTES = 128_000;
export const MAX_LITERAL_VERIFICATION_BATCHES = 10;
export const MAX_INITIAL_LITERAL_VERIFICATION_CANDIDATES = MAX_LITERAL_VERIFICATION_CANDIDATES * MAX_LITERAL_VERIFICATION_BATCHES;

/** Validate the whole response before querying; preserve every original candidate. */
export function planLiteralVerificationBatches(candidates: readonly BugbotFinding[]): readonly (readonly BugbotFinding[])[] {
  if (candidates.length === 0 || candidates.length > MAX_INITIAL_LITERAL_VERIFICATION_CANDIDATES) {
    throw new ApplicationError('agent.failed', 'Generated-source verification requires between 1 and 200 initial candidates, matching the review schema. No complete review was verified.');
  }
  const batches: BugbotFinding[][] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < candidates.length; offset += MAX_LITERAL_VERIFICATION_CANDIDATES) {
    const batch = candidates.slice(offset, offset + MAX_LITERAL_VERIFICATION_CANDIDATES);
    for (const id of originalCandidates(batch).keys()) {
      if (seen.has(id)) throw invalidVerification();
      seen.add(id);
    }
    batches.push(batch);
  }
  return batches;
}

export function literalVerificationId(source: string, candidates: readonly BugbotFinding[]): string {
  originalCandidates(candidates);
  return createHash('sha256').update(source).update('\0').update(JSON.stringify(candidates)).digest('hex');
}

export function assertLiteralVerificationPrompt(prompt: string): void {
  if (Buffer.byteLength(prompt, 'utf8') > MAX_LITERAL_VERIFICATION_PROMPT_BYTES) {
    throw new ApplicationError('agent.failed', 'Generated-source verification exceeded its fixed 128000-byte prompt bound. Split the review scope and recheck; verification did not complete.');
  }
}

export function applyLiteralVerification(
  expected: string, observed: string, original: readonly BugbotFinding[],
  retained: readonly BugbotFinding[], rejected: readonly string[],
): BugbotFinding[] {
  const originals = originalCandidates(original);
  if (expected !== observed || !/^[a-f0-9]{64}$/u.test(expected)
    || retained.length + rejected.length !== original.length) throw invalidVerification();
  const seen = new Set<string>();
  for (const finding of retained) {
    const candidate = originals.get(finding.id);
    if (!candidate || seen.has(finding.id) || candidate.file !== finding.file
      || (candidate.codeSnippet !== undefined && candidate.codeSnippet !== finding.codeSnippet)
      || !finding.evidence?.trim()) throw invalidVerification();
    seen.add(finding.id);
  }
  for (const rejectedId of rejected) {
    if (!originals.has(rejectedId) || seen.has(rejectedId)) throw invalidVerification();
    seen.add(rejectedId);
  }
  return retained.map(finding => ({ ...finding }));
}

function originalCandidates(candidates: readonly BugbotFinding[]): ReadonlyMap<string, BugbotFinding> {
  if (candidates.length === 0 || candidates.length > MAX_LITERAL_VERIFICATION_CANDIDATES) {
    throw new ApplicationError('agent.failed', 'Generated-source verification requires between 1 and 20 candidates. Split the review scope and recheck; verification did not complete.');
  }
  const originals = new Map<string, BugbotFinding>();
  for (const candidate of candidates) {
    if (!candidate.id.trim() || originals.has(candidate.id)) throw invalidVerification();
    originals.set(candidate.id, candidate);
  }
  if (Buffer.byteLength(JSON.stringify(candidates), 'utf8') > MAX_LITERAL_VERIFICATION_CANDIDATE_BYTES) {
    throw new ApplicationError('agent.failed', 'Generated-source verification exceeded its fixed 32000-byte candidate bound. Split the review scope and recheck; verification did not complete.');
  }
  return originals;
}

function invalidVerification(): ApplicationError {
  return new ApplicationError('agent.failed', 'Generated-source verification is incomplete or changed candidate identity, file, anchor or proof. Recheck the exact source; no clean result was verified.');
}
