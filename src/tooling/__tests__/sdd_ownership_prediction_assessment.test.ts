import { createHash } from 'node:crypto';
import { parseSddPlan } from '../../domain/pre_branch_sdd';
import { scoreOwnershipQuestion } from '../sdd_ownership_question_scoring';

const { assessPrediction } = require('../../../quality/sdd/ownership-qualification.cjs') as {
  assessPrediction(input: {
    scenario: { id: string; expected: { ownershipQuestion?: boolean; tuple?: Record<string, string> } };
    response: unknown;
    fixture: { capabilities: { id: string; specs: string[] }[] };
    variant: string;
    assessments: Record<string, unknown>;
    parseSddPlan: typeof parseSddPlan;
    scoreOwnershipQuestion: typeof scoreOwnershipQuestion;
  }): { correct: boolean; error?: string; ownershipQuestionScore?: string; response: unknown };
};
const tuple = { action: 'update', capabilityId: 'owner', path: 'specs/owner.md' };
const response = {
  ...tuple, reason: 'Preserve the registered publication while clarifying its ownership.', newCapability: null,
  questions: [{ id: 'Q1', text: 'Which existing capability should own this publication: owner or other?', owner: 'maintainer' }],
};
const input = {
  scenario: { id: 'ambiguous-existing-owner', expected: { ownershipQuestion: true } },
  fixture: { capabilities: [{ id: 'owner', specs: ['specs/owner.md'] }, { id: 'other', specs: ['specs/other.md'] }] },
  variant: 'owned-regression-1', assessments: {}, parseSddPlan,
};

describe('856: actual qualification prediction assessment', () => {
  it.each([undefined, null, true, 13, 'not-json', {}, []])('records invalid response %p without hashing or reading questions', value => {
    const score = jest.fn(scoreOwnershipQuestion);
    const result = assessPrediction({ ...input, response: value, scoreOwnershipQuestion: score });
    expect(result.correct).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.response).toBe(value);
    expect(score).not.toHaveBeenCalled();
  });
  it.each([response, JSON.stringify(response)])('still accepts a valid explicit tuple response %p', value => {
    const result = assessPrediction({ ...input, scenario: { id: 'explicit-owner', expected: { tuple } },
      response: value, scoreOwnershipQuestion });
    expect(result.correct).toBe(true);
    expect(result.error).toBeUndefined();
  });
  it('keeps a valid ownership question pending without explicit semantic evidence', () => {
    const result = assessPrediction({ ...input, response, scoreOwnershipQuestion });
    expect(result.correct).toBe(false);
    expect(result.ownershipQuestionScore).toBe('needs-assessment');
  });
  it('accepts the exact valid response with its explicit bound assessment', () => {
    const assessment = {
      trialId: input.variant, caseId: input.scenario.id,
      responseSha256: createHash('sha256').update(JSON.stringify(response)).digest('hex'),
      questionId: 'Q1', questionText: response.questions[0].text, intent: 'select-existing-owner',
      reviewer: 'Codex repository contributor (agent)',
      rationale: 'The question explicitly asks which of the two existing owners governs this publication.',
      verdict: 'resolves-required-ownership',
    };
    const result = assessPrediction({ ...input, response, scoreOwnershipQuestion,
      assessments: { [input.scenario.id]: assessment } });
    expect(result.correct).toBe(true);
    expect(result.ownershipQuestionScore).toBe('accepted');
  });
});
