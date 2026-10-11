import { draftSddMarkdown } from './pre_branch_sdd_draft_workflow';
import { SddDraftFormatFailure, type SddPlan } from '../../../domain/pre_branch_sdd';

const configuration = { provider: 'codex', model: 'model' } as never;
const plan = { action: 'update', path: 'specs/payments.md', capabilityId: 'payments', reason: 'A bounded contract change.', questions: [] } as const;

describe('draftSddMarkdown', () => {
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
    expect(query.mock.calls[1][0].prompt).toContain('12000 characters');
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
});
