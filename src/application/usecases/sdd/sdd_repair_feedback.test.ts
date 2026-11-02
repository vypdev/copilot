import { draftSddMarkdown } from './pre_branch_sdd_draft_workflow';
import { SddDraftFormatFailure } from '../../../domain/pre_branch_sdd';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import { ApplicationError } from '../../errors/application_error';
import type { SddValidationDiagnostic } from '../../../domain/sdd_validation_diagnostic';
import { FindingsAgentAdapter } from '../../../data/repository/ai/findings_agent_adapter';
import { sddConsistencyFixture } from '../../../testing/sdd_consistency_fixture';
import { validateSddDraftConsistency } from '../../../domain/sdd_draft_consistency';

const configuration = { provider: 'codex' as const, modelProvider: 'openai', model: 'fixture-model' };
const plan = { action: 'companion', path: 'specs/change.md', capabilityId: 'payments', reason: 'Retain the existing owner.', questions: [] } as const;
const facts: SddValidationDiagnostic = { reason: 'requirement-mapping', phase: 'validation', facts: [
  { detail: 'requirement-reference', section: 14, row: 2, expected: 0, observed: 1 },
] };
const failure = () => new SddDraftFormatFailure('requirement-mapping', 'PRIVATE_ERROR @actor /command', facts);
const query = () => jest.fn().mockResolvedValue({ markdown: 'PRIVATE_REJECTED_DRAFT' });
const prompt = 'Preserve the complete resolved requirements and existing owner.';

it('sdd-feedback-C09: forwards only closed writer-validation facts on the sole repair with the original request', async () => {
  const q = query(); const validate = jest.fn().mockRejectedValueOnce(failure()).mockResolvedValue(undefined);
  await draftSddMarkdown({ query: q }, configuration, plan, prompt, validate);
  expect(q).toHaveBeenCalledTimes(2);
  const [initial, repair] = q.mock.calls.map(([request]) => request);
  expect(repair).toEqual({ ...initial, prompt: expect.any(String) });
  expect(repair.prompt).toContain(JSON.stringify(facts));
  expect(initial.prompt).not.toContain(JSON.stringify(facts));
  expect(repair.prompt).toContain(prompt);
  expect(repair.prompt).not.toMatch(/PRIVATE_|@actor|\/command/u);
});
it('sdd-feedback-C10: native response assembly forwards host phase and coordinates before writer validation', async () => {
  const raw = sddConsistencyFixture()
    .replace(/\| Area \| Minimum distinct cases[\s\S]*?(?=\| Case ID)/u, '{{SDD_CASE_BUDGET}}\n\n')
    .replace(/\| Requirement \| Cases \|[\s\S]*$/u, '{{SDD_REQUIREMENT_CASES}}\n');
  const invalid = raw.replace('C02 | Policy | G-01 |', 'C02 | Policy | G-99 |');
  const execute = jest.fn().mockResolvedValueOnce(JSON.stringify({ markdown: invalid }))
    .mockResolvedValueOnce(JSON.stringify({ markdown: sddConsistencyFixture() }));
  const adapter = new FindingsAgentAdapter({ cli: { execute } });
  const validate = jest.fn(async (markdown: string) => validateSddDraftConsistency(markdown, [], {
    files: new Set(['docs/payments.mdx']), directories: new Set(['docs']), blocked: new Set(),
  }, 'specs/change.md'));
  await draftSddMarkdown(adapter, configuration, plan, prompt, validate);
  const repair = execute.mock.calls[1][0];
  expect(repair.prompt).toContain(JSON.stringify({ ...facts, phase: 'assembly' }));
  expect(repair.outputSchema).toEqual(execute.mock.calls[0][0].outputSchema);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(validate).toHaveBeenCalledTimes(1);
});
it('sdd-feedback-C11: repeated failure retains terminal facts with no third query or accepted candidate', async () => {
  const q = query(), validate = jest.fn().mockRejectedValue(failure());
  await expect(draftSddMarkdown({ query: q }, configuration, plan, prompt, validate))
    .rejects.toMatchObject({ attempts: 2, diagnostic: facts });
  expect(q).toHaveBeenCalledTimes(2);
  expect(q.mock.calls[1][0].prompt).toContain(JSON.stringify(facts));
});
it.each([
  ['outer data', { ...facts, private: 'PRIVATE_EXTRA' }],
  ['fact data', { ...facts, facts: [{ ...facts.facts[0], private: 'PRIVATE_EXTRA' }] }],
  ['reason disagreement', { ...facts, reason: 'repository-path' }],
])('sdd-feedback-C12/C13/C14: rejects tampered %s before a replacement prompt can disclose it', async (_label, diagnostic) => {
  const error = failure(); Object.assign(error, { diagnostic });
  const q = query(), validate = jest.fn().mockRejectedValue(error);
  await expect(draftSddMarkdown({ query: q }, configuration, plan, prompt, validate)).rejects.toThrow(TypeError);
  expect(q).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(q.mock.calls)).not.toContain('PRIVATE_EXTRA');
});
it('sdd-feedback-C15: size followed by format rejection shares the original two-query ceiling', async () => {
  const q = query().mockRejectedValueOnce(new AgentResponseLengthFailure('$.markdown', 70000));
  const validate = jest.fn().mockRejectedValue(failure());
  await expect(draftSddMarkdown({ query: q }, configuration, plan, prompt, validate))
    .rejects.toMatchObject({ attempts: 2, diagnostic: facts });
  expect(q).toHaveBeenCalledTimes(2);
  expect(q.mock.calls[1][0].prompt).toContain('70000-character draft limit');
});
it.each(['provider.unavailable', 'workflow.cancelled'] as const)('sdd-feedback-C16/C17: keeps %s identity without content repair', async code => {
  const error = new ApplicationError(code, 'PRIVATE_PROVIDER');
  const q = query().mockRejectedValue(error);
  await expect(draftSddMarkdown({ query: q }, configuration, plan, prompt)).rejects.toBe(error);
  expect(q).toHaveBeenCalledTimes(1);
});
