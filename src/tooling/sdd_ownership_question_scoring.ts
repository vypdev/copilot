/** Offline qualification evidence, never a model question schema or native approval. */
export type OwnershipQuestionIntent = 'select-existing-owner' | 'resolve-owner-path-conflict';

export interface OwnershipQuestionEvidence {
  readonly trialId: string;
  readonly caseId: string;
  readonly responseSha256: string;
  readonly expectedIntent: OwnershipQuestionIntent;
  readonly questions: readonly { readonly id: string; readonly text: string }[];
}

export type OwnershipQuestionScore = 'needs-assessment' | 'invalid-assessment' | 'rejected' | 'accepted';

/** Semantic interpretation is explicit assessor evidence; keywords can never grant a pass. */
export function scoreOwnershipQuestion(evidence: OwnershipQuestionEvidence, assessment?: unknown): OwnershipQuestionScore {
  if (assessment === undefined) return 'needs-assessment';
  if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) return 'invalid-assessment';
  const value = assessment as Record<string, unknown>;
  const fields = ['trialId', 'caseId', 'responseSha256', 'questionId', 'questionText', 'intent', 'reviewer', 'rationale', 'verdict'];
  if (fields.some(key => typeof value[key] !== 'string' || !(value[key] as string).trim())) return 'invalid-assessment';
  if (value.trialId !== evidence.trialId || value.caseId !== evidence.caseId || value.responseSha256 !== evidence.responseSha256
    || value.intent !== evidence.expectedIntent) return 'invalid-assessment';
  const question = evidence.questions.find(item => item.id === value.questionId);
  if (!question || question.text !== value.questionText) return 'invalid-assessment';
  if (value.verdict !== 'resolves-required-ownership') return 'rejected';
  if (evidence.expectedIntent === 'resolve-owner-path-conflict' && value.conflictIdentified !== true) return 'rejected';
  return 'accepted';
}
