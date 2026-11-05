import { scoreOwnershipQuestion, type OwnershipQuestionEvidence } from '../sdd_ownership_question_scoring';

const question = 'Which capability should own the criteria: household-identity or application-experience?';
const evidence: OwnershipQuestionEvidence = {
  trialId: 'owned-trial-1', caseId: 'ambiguous-existing-owner', responseSha256: 'a'.repeat(64), expectedIntent: 'select-existing-owner',
  questions: [{ id: 'Q1', text: question }],
};
const assessment = {
  trialId: evidence.trialId, caseId: evidence.caseId, responseSha256: evidence.responseSha256, questionId: 'Q1', questionText: question,
  intent: evidence.expectedIntent, reviewer: 'Codex repository contributor',
  rationale: 'The question asks the maintainer to choose the capability that owns the criteria.',
  verdict: 'resolves-required-ownership',
};

describe('856: ownership question qualification evidence', () => {
  it.each(['What publication date is planned?', 'Which path should hold the screenshots?'])('does not automatically accept unrelated question %s', text => {
    expect(scoreOwnershipQuestion({ ...evidence, questions: [{ id: 'Q1', text }] })).toBe('needs-assessment');
  });
  it('accepts an explicitly assessed ownership decision bound to the exact response', () => {
    expect(scoreOwnershipQuestion(evidence, assessment)).toBe('accepted');
  });
  it.each([null, false, 12, 'accepted', []])('rejects malformed assessment %p', value => {
    expect(scoreOwnershipQuestion(evidence, value)).toBe('invalid-assessment');
  });
  it.each(['trialId', 'caseId', 'responseSha256', 'questionId', 'questionText', 'intent', 'reviewer', 'rationale', 'verdict'])('rejects missing assessment field %s', field => {
    expect(scoreOwnershipQuestion(evidence, { ...assessment, [field]: undefined })).toBe('invalid-assessment');
  });
  it('rejects whitespace-only rationale', () => {
    expect(scoreOwnershipQuestion(evidence, { ...assessment, rationale: '  ' })).toBe('invalid-assessment');
  });
  it.each(['trialId', 'caseId', 'responseSha256', 'intent'])('rejects mismatching identity %s', field => {
    expect(scoreOwnershipQuestion(evidence, { ...assessment, [field]: 'different' })).toBe('invalid-assessment');
  });
  it('rejects a question absent from the response', () => {
    expect(scoreOwnershipQuestion(evidence, { ...assessment, questionId: 'Q2' })).toBe('invalid-assessment');
  });
  it('rejects changed question bytes even when the response identity is claimed', () => {
    expect(scoreOwnershipQuestion(evidence, { ...assessment, questionText: 'Which publication date?' })).toBe('invalid-assessment');
  });
  it('preserves a negative semantic assessment despite ownership-related keywords', () => {
    const text = 'Which publication date is planned?';
    expect(scoreOwnershipQuestion({ ...evidence, questions: [{ id: 'Q1', text }] }, {
      ...assessment, questionText: text, verdict: 'does-not-resolve', rationale: 'A publication date does not select the owner.',
    })).toBe('rejected');
  });
  it.each([undefined, false, 'true'])('requires explicit conflict assessment rather than truthiness %p', conflictIdentified => {
    expect(scoreOwnershipQuestion({ ...evidence, expectedIntent: 'resolve-owner-path-conflict' }, {
      ...assessment, intent: 'resolve-owner-path-conflict', conflictIdentified,
    })).toBe('rejected');
  });
  it('accepts an explicitly identified owner/path conflict with matching semantic evidence', () => {
    const text = 'The catalog assigns specs/household-administration.md to household-identity, while the request says delivery. Which ownership should govern?';
    expect(scoreOwnershipQuestion({ ...evidence, expectedIntent: 'resolve-owner-path-conflict', questions: [{ id: 'Q1', text }] }, {
      ...assessment, questionText: text, intent: 'resolve-owner-path-conflict', conflictIdentified: true,
      rationale: 'The question names the registered owner, conflicting requested owner and disputed path, then asks which governs.',
    })).toBe('accepted');
  });
});
