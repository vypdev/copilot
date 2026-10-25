import { draftSddMarkdown } from './pre_branch_sdd_draft_workflow';
import { SddDraftFormatFailure, validateSddMarkdown, type SddPlan } from '../../../domain/pre_branch_sdd';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import { FindingsAgentAdapter } from '../../../data/repository/ai/findings_agent_adapter';
import { validateSddDraftConsistency } from '../../../domain/sdd_draft_consistency';
import { sddConsistencyFixture } from '../../../testing/sdd_consistency_fixture';

const configuration = { provider: 'codex', model: 'model' } as never;
const plan = { action: 'update', path: 'specs/payments.md', capabilityId: 'payments', reason: 'A bounded contract change.', questions: [] } as const;

describe('draftSddMarkdown', () => {
  const assemblyDraft = () => sddConsistencyFixture()
    .replace(/\| Area \| Minimum distinct cases[\s\S]*?(?=\| Case ID)/u, '{{SDD_CASE_BUDGET}}\n\n')
    .replace(/\| Requirement \| Cases \|[\s\S]*$/u, '{{SDD_REQUIREMENT_CASES}}\n');

  it('assembles the native findings response before the unchanged publication checks run', async () => {
    const execute = jest.fn().mockResolvedValue(JSON.stringify({ markdown: assemblyDraft() }));
    const adapter = new FindingsAgentAdapter({ cli: { execute } });
    const validate = jest.fn(async (candidate: string) => {
      validateSddMarkdown(candidate);
      validateSddDraftConsistency(candidate, [], {
        files: new Set(['docs/payments.mdx']), directories: new Set(['docs']), blocked: new Set(),
      }, 'specs/change.md');
    });
    const markdown = await draftSddMarkdown(adapter, { provider: 'codex', modelProvider: 'openai', model: 'gpt-5' },
      { ...plan, action: 'new' }, 'Preserve all three distinct cases and both requirements.', validate);
    expect(markdown).toContain('| Policy | 2 |');
    expect(markdown).toContain('| Total | 3 |');
    expect(markdown).toContain('| G-01 | payments-change-C01, payments-change-C02 |');
    expect(markdown).not.toContain('{{SDD_');
    expect(validate).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].prompt).toContain('Preserve every resolved minimum, per-area allocation');
    expect(execute.mock.calls[0][0].prompt).toContain('hard limit applies after assembly');
  });

  it('spends the existing shared repair when generated slots are malformed without echoing that draft', async () => {
    const invalid = assemblyDraft().replace('{{SDD_REQUIREMENT_CASES}}', 'Untrusted rejected content @actor');
    const query = jest.fn().mockResolvedValueOnce({ markdown: invalid }).mockResolvedValueOnce({ markdown: assemblyDraft() });
    const validate = jest.fn().mockResolvedValue(undefined);
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original resolved inventory', validate)).resolves.toContain('| Total | 3 |');
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[1][0].prompt).toContain('SDD requirement-mapping contract');
    expect(query.mock.calls[1][0].prompt).not.toContain('Untrusted rejected content @actor');
  });

  it('enforces the final assembled character bound even when both raw responses fit their schema', async () => {
    const raw = assemblyDraft();
    const atLimit = `${'x'.repeat(18000 - raw.length - 1)}\n${raw}`;
    expect(atLimit).toHaveLength(18000);
    const query = jest.fn().mockResolvedValue({ markdown: atLimit });
    const validate = jest.fn();
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original', validate))
      .rejects.toMatchObject({ recovery: { id: 'sdd-draft-size-exceeded' } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate).not.toHaveBeenCalled();
  });

  it('stops after the single assembly repair with the existing closed recovery and no writer call', async () => {
    const query = jest.fn().mockResolvedValue({ markdown: assemblyDraft().replace('{{SDD_CASE_BUDGET}}', '') });
    const validate = jest.fn();
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original', validate))
      .rejects.toMatchObject({ recovery: { id: 'sdd-draft-case-budget-invalid', variables: {} } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate).not.toHaveBeenCalled();
  });

  it.each(['case-identity', 'case-budget', 'requirement-mapping', 'repository-path'] as const)(
    'repairs %s once with closed feedback and returns a specific non-ready recovery on repeated failure', async reason => {
      const query = jest.fn().mockResolvedValue({ markdown: 'Untrusted invalid document' });
      const validate = jest.fn().mockRejectedValue(new SddDraftFormatFailure(reason, 'untrusted diagnostic @actor /command'));
      await expect(draftSddMarkdown({ query }, configuration, plan, 'Resolved requirements', validate)).rejects.toMatchObject({
        recovery: { id: `sdd-draft-${reason}-invalid`, variables: {} },
      });
      expect(query).toHaveBeenCalledTimes(2);
      expect(validate).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[1][0].prompt).toContain(`SDD ${reason} contract`);
      expect(query.mock.calls[1][0].prompt).toContain('Case ID | Area | Requirements | Scenario');
      expect(query.mock.calls[1][0].prompt).not.toMatch(/Untrusted invalid document|untrusted diagnostic|@actor/);
    },
  );

  it('revalidates a corrected semantic draft without spending a third generation', async () => {
    const query = jest.fn().mockResolvedValueOnce({ markdown: 'Invalid cases' }).mockResolvedValueOnce({ markdown: 'Corrected cases' });
    const validate = jest.fn().mockRejectedValueOnce(new SddDraftFormatFailure('case-budget', 'Rejected')).mockResolvedValueOnce(undefined);
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Resolved requirements', validate)).resolves.toBe('Corrected cases');
    expect(validate.mock.calls.map(call => call[0])).toEqual(['Invalid cases', 'Corrected cases']);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('accepts a real findings response with only the canonical numeric table without regeneration', async () => {
    const markdown = `${'Explicit product scope and architecture. '.repeat(55)}\n## 1. Executive summary\n## 4. Goals\n## 8. Clean Architecture\n## 14. Testing strategy\n| Area | Minimum distinct cases | Risks |\n|---|---:|---|\n| Policy | 4 | Authority |\n| Total | 4 | Distinct |\n## 16. Acceptance\n`;
    const execute = jest.fn().mockResolvedValue(JSON.stringify({ markdown }));
    const adapter = new FindingsAgentAdapter({ cli: { execute } });
    await expect(draftSddMarkdown(adapter, { provider: 'codex', modelProvider: 'openai', model: 'gpt-5' }, plan, 'Resolved requirements',
      async candidate => validateSddMarkdown(candidate))).resolves.toBe(markdown);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].prompt).toContain('Total must equal the sum');
  });
  it('repairs the real findings adapter schema rejection before any draft reaches the writer', async () => {
    const execute = jest.fn().mockResolvedValueOnce(JSON.stringify({ markdown: 'untrusted secret '.repeat(5000) }))
      .mockResolvedValueOnce(JSON.stringify({ markdown: 'Accepted draft '.repeat(150) }));
    const validate = jest.fn().mockResolvedValue(undefined);
    const adapter = new FindingsAgentAdapter({ cli: { execute } });
    await expect(draftSddMarkdown(adapter, { provider: 'codex', modelProvider: 'openai', model: 'gpt-5' },
      { ...plan, action: 'companion' }, 'Original resolved requirements', validate)).resolves.toContain('Accepted draft');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[1][0].prompt).not.toContain('untrusted secret');
    expect(execute.mock.calls[1][0].prompt).toContain('## 8. Clean Architecture');
    expect(execute.mock.calls[1][0].prompt).toContain('Original resolved requirements');
    expect(execute.mock.calls[1][0].outputSchema).toEqual(execute.mock.calls[0][0].outputSchema);
  });

  it('stops after two matching schema length rejections without invoking writer validation', async () => {
    const query = jest.fn().mockRejectedValue(new AgentResponseLengthFailure('$.markdown', 18000));
    const validate = jest.fn();
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original', validate))
      .rejects.toMatchObject({ recovery: { id: 'sdd-draft-size-exceeded' } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate).not.toHaveBeenCalled();
  });

  it.each([
    new AgentResponseLengthFailure('$.other', 18000),
    new AgentResponseLengthFailure('$.markdown', 70000),
    new Error('Agent response schema violation at $.markdown: string is too long.'),
  ])('does not repair a foreign path, different bound or forged diagnostic: %s', async error => {
    const query = jest.fn().mockRejectedValue(error);
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original')).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not classify an adapter minimum-length violation as a maximum-length repair', async () => {
    const execute = jest.fn().mockResolvedValue(JSON.stringify({ markdown: 'short' }));
    const adapter = new FindingsAgentAdapter({ cli: { execute } });
    await expect(draftSddMarkdown(adapter, { provider: 'codex', modelProvider: 'openai', model: 'gpt-5' }, plan, 'Original'))
      .rejects.toThrow('too short');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('shares the repair ceiling between a schema length rejection and a writer format rejection', async () => {
    const query = jest.fn().mockRejectedValueOnce(new AgentResponseLengthFailure('$.markdown', 18000))
      .mockResolvedValueOnce({ markdown: 'Invalid format' });
    const validate = jest.fn().mockRejectedValue(new SddDraftFormatFailure('test-budget', 'Missing budget'));
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original', validate))
      .rejects.toMatchObject({ recovery: { id: 'sdd-draft-format-invalid' } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('shares the repair ceiling between a writer format rejection and a schema length rejection', async () => {
    const query = jest.fn().mockResolvedValueOnce({ markdown: 'Invalid format' })
      .mockRejectedValueOnce(new AgentResponseLengthFailure('$.markdown', 18000));
    const validate = jest.fn().mockRejectedValue(new SddDraftFormatFailure('required-heading', 'Missing heading'));
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original', validate))
      .rejects.toMatchObject({ recovery: { id: 'sdd-draft-size-exceeded' } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(1);
  });
  it.each(['required-heading', 'test-budget'] as const)('repairs typed %s validation once without echoing the rejected draft or diagnostic', async reason => {
    const query = jest.fn().mockResolvedValueOnce({ markdown: 'untrusted rejected draft' }).mockResolvedValueOnce({ markdown: 'Accepted draft' });
    const validate = jest.fn().mockRejectedValueOnce(new SddDraftFormatFailure(reason, 'untrusted provider diagnostic')).mockResolvedValue(undefined);
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original requirements', validate)).resolves.toBe('Accepted draft');
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate.mock.calls.map(call => call[0])).toEqual(['untrusted rejected draft', 'Accepted draft']);
    expect(query.mock.calls[1][0].prompt).toContain('exact numbered canonical headings');
    expect(query.mock.calls[1][0].prompt).toContain('same owner and plan');
    expect(query.mock.calls[1][0].prompt).not.toMatch(/untrusted rejected draft|untrusted provider diagnostic/);
  });

  it('stops after repeated typed format failures with closed recovery and no accepted draft', async () => {
    const query = jest.fn().mockResolvedValue({ markdown: 'Invalid draft' });
    const validate = jest.fn().mockRejectedValue(new SddDraftFormatFailure('required-heading', 'Missing heading'));
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original requirements', validate)).rejects.toMatchObject({
      recovery: { id: 'sdd-draft-format-invalid', variables: {} },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('does not retry catalog, authority or workspace failures as format errors', async () => {
    const error = new Error('Owner changed');
    const query = jest.fn().mockResolvedValue({ markdown: 'Candidate draft' });
    const validate = jest.fn().mockRejectedValue(error);
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original requirements', validate)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('shares the one repair between an oversized first draft and a malformed second draft', async () => {
    const query = jest.fn().mockResolvedValueOnce({ markdown: 'x'.repeat(18001) }).mockResolvedValueOnce({ markdown: 'Invalid format' });
    const validate = jest.fn().mockRejectedValue(new SddDraftFormatFailure('test-budget', 'Missing budget'));
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original requirements', validate)).rejects.toMatchObject({ recovery: { id: 'sdd-draft-format-invalid' } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('shares the one repair between a malformed first draft and an oversized second draft', async () => {
    const query = jest.fn().mockResolvedValueOnce({ markdown: 'Invalid format' }).mockResolvedValueOnce({ markdown: 'x'.repeat(18001) });
    const validate = jest.fn().mockRejectedValue(new SddDraftFormatFailure('required-heading', 'Missing heading'));
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original requirements', validate)).rejects.toMatchObject({ recovery: { id: 'sdd-draft-size-exceeded' } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it.each([['update', 18000], ['companion', 70000], ['new', 70000]] as const)(
    'binds the provider schema to the writer limit for %s', async (action, maximum) => {
      const query = jest.fn().mockResolvedValue({ markdown: 'x'.repeat(maximum) });
      await expect(draftSddMarkdown({ query }, configuration, { ...plan, action } as SddPlan, 'Original prompt'))
        .resolves.toHaveLength(maximum);
      expect(query.mock.calls[0][0].options.schema.properties.markdown).toEqual({ type: 'string', minLength: 1800, maxLength: maximum });
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it('regenerates an oversized response once without echoing its untrusted content or changing the owner', async () => {
    const query = jest.fn().mockResolvedValueOnce({ markdown: 'untrusted previous draft '.repeat(1000) })
      .mockResolvedValueOnce({ markdown: 'Valid regenerated content' });
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original prompt'))
      .resolves.toBe('Valid regenerated content');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0].prompt).toContain('same owner and plan');
    expect(query.mock.calls[1][0].prompt).toContain('6000 characters');
    expect(query.mock.calls[1][0].prompt).not.toContain('untrusted previous draft');
    expect(query.mock.calls[1][0].options).toEqual(query.mock.calls[0][0].options);
  });

  it('stops after the second oversized draft with a closed actionable recovery', async () => {
    const query = jest.fn().mockResolvedValue({ markdown: 'x'.repeat(18001) });
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original prompt')).rejects.toMatchObject({
      code: 'validation.invalid-input', recovery: { id: 'sdd-draft-size-exceeded', variables: {} },
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([null, [], { markdown: 5 }])('rejects malformed output without a size retry: %j', async value => {
    const query = jest.fn().mockResolvedValue(value);
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original prompt'))
      .rejects.toMatchObject({ code: 'validation.invalid-input' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preserves provider failure without retrying it as a content size error', async () => {
    const error = new Error('Read unavailable');
    const query = jest.fn().mockRejectedValue(error);
    await expect(draftSddMarkdown({ query }, configuration, plan, 'Original prompt')).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([['update', 18000, 6000], ['companion', 70000, 10000]] as const)(
    'uses a compact %s draft target while preserving the hard bound, resolved requirements and repair ceiling', async (action, maximum, target) => {
      const query = jest.fn().mockResolvedValueOnce({ markdown: 'x'.repeat(maximum + 1) })
        .mockResolvedValueOnce({ markdown: 'Accepted compact complete draft' });
      const requirements = 'Resolved R1: preserve existing secrets. R2: exact reviewed repositories. R3: numeric tests and recovery.';
      await expect(draftSddMarkdown({ query }, configuration, { ...plan, action } as SddPlan, requirements))
        .resolves.toBe('Accepted compact complete draft');
      expect(query).toHaveBeenCalledTimes(2);
      for (const [request] of query.mock.calls) {
        expect(request.prompt).toContain(`aim for ${target} characters`);
        expect(request.prompt).toContain(requirements);
        expect(request.prompt).toContain('Preserve the same owner, decisions and requirements');
        expect(request.options.schema.properties.markdown).toEqual({ type: 'string', minLength: 1800, maxLength: maximum });
      }
      expect(query.mock.calls[1][0].prompt).toContain('same owner and plan');
    },
  );
});
