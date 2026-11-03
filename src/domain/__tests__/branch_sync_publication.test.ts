import { admittedBranchSyncObjectId, BranchSyncPublicationFailure, isBranchSyncObjectId, isBranchSyncPublicationDiagnostic, type BranchSyncPublicationDiagnostic } from '../branch_sync_publication';
import { admittedGitPushDenial, GitPushFailure } from '../git_push_failure';

const originalSha = 'a'.repeat(40), candidateSha = 'b'.repeat(40);
const facts: BranchSyncPublicationDiagnostic = { reason: 'push-failed', remoteState: 'unchanged', originalSha, candidateSha, observedSha: originalSha, pushAttempted: true };
describe('Closed branch synchronization publication facts', () => {
  it.each([40, 64])('admits a nonzero %i-character Git object identity', length => {
    expect(isBranchSyncObjectId('a'.repeat(length))).toBe(true);
    expect(admittedBranchSyncObjectId('a'.repeat(length))).toBe('a'.repeat(length));
  });
  it.each([undefined, null, 12, '', '0'.repeat(40), '0'.repeat(64), 'A'.repeat(40), 'a'.repeat(39), 'b'.repeat(41), 'secret/path', 'a'.repeat(40) + '\n'])('rejects invalid identity %p', value => {
    expect(isBranchSyncObjectId(value)).toBe(false); expect(admittedBranchSyncObjectId(value)).toBe('unavailable');
  });
  it.each([
    facts,
    { ...facts, remoteState: 'published', observedSha: candidateSha },
    { ...facts, remoteState: 'changed', observedSha: 'c'.repeat(40) },
    { ...facts, remoteState: 'unverified', observedSha: 'unavailable' },
    { ...facts, remoteState: 'unverified', originalSha: 'unavailable', observedSha: 'c'.repeat(64) },
    { ...facts, reason: 'workflow-write-required' },
    { ...facts, reason: 'candidate-unverified', candidateSha: 'unavailable', pushAttempted: false },
    { ...facts, reason: 'candidate-unverified', candidateSha: 'unavailable', pushAttempted: false, remoteState: 'unverified', observedSha: 'unavailable' },
  ])('admits only coherent publication facts: %p', diagnostic => {
    expect(isBranchSyncPublicationDiagnostic(diagnostic)).toBe(true);
    const error = new BranchSyncPublicationFailure(diagnostic as BranchSyncPublicationDiagnostic);
    expect(error.diagnostic).toEqual(diagnostic); expect(Object.isFrozen(error)).toBe(true);
    expect(Object.isFrozen(error.diagnostic)).toBe(true); expect(error.diagnostic).not.toBe(diagnostic);
  });
  it.each([
    null, [], 'PRIVATE', {}, { ...facts, extra: 'PRIVATE' }, { ...facts, reason: 'PRIVATE' },
    { ...facts, remoteState: 'PRIVATE' }, { ...facts, pushAttempted: 'true' },
    { ...facts, originalSha: 'PRIVATE' }, { ...facts, candidateSha: 'PRIVATE' }, { ...facts, observedSha: 'PRIVATE' },
    { ...facts, pushAttempted: false }, { ...facts, candidateSha: originalSha },
    { ...facts, candidateSha: 'unavailable' },
    { ...facts, reason: 'candidate-unverified', pushAttempted: false },
    { ...facts, reason: 'candidate-unverified' },
    { ...facts, reason: 'candidate-unverified', candidateSha: 'unavailable' },
    { ...facts, reason: 'candidate-unverified', pushAttempted: false, candidateSha: 'unavailable', remoteState: 'published', observedSha: 'unavailable' },
    { ...facts, remoteState: 'changed', originalSha: 'unavailable', observedSha: 'c'.repeat(40) },
    { ...facts, remoteState: 'published' }, { ...facts, remoteState: 'unchanged', observedSha: candidateSha },
    { ...facts, remoteState: 'changed' }, { ...facts, remoteState: 'changed', observedSha: candidateSha },
    { ...facts, remoteState: 'changed', observedSha: 'unavailable' },
    { ...facts, remoteState: 'unchanged', originalSha: 'unavailable', observedSha: 'unavailable' },
    { ...facts, remoteState: 'unverified' },
    { ...facts, remoteState: 'unverified', originalSha: 'unavailable', observedSha: candidateSha },
  ])('rejects malformed or contradictory publication facts: %p', diagnostic => {
    expect(isBranchSyncPublicationDiagnostic(diagnostic)).toBe(false);
    expect(() => new BranchSyncPublicationFailure(diagnostic as BranchSyncPublicationDiagnostic)).toThrow(TypeError);
  });
  it('accepts workflow denial only from the closed typed producer', () => {
    const error = new GitPushFailure('workflow-write-required');
    expect(Object.isFrozen(error)).toBe(true); expect(admittedGitPushDenial(error)).toBe('workflow-write-required');
    for (const value of [new Error('workflow-write-required'), { reason: 'workflow-write-required' }, new GitPushFailure('unclassified'), null]) {
      expect(admittedGitPushDenial(value)).toBe('unclassified');
    }
  });
});
