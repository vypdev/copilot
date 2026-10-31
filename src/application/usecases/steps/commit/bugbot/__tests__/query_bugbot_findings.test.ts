import { queryBugbotFindings, queryBugbotPartitionFindings } from '../query_bugbot_findings';

const expected = {
  partitionId: 'diff-1-of-2-12345678',
  headSha: 'a'.repeat(40),
};
const validResponse = {
  outputLocale: 'en-US',
  partition_id: expected.partitionId,
  reviewed_head_sha: expected.headSha,
  findings: [],
  resolved_findings: [],
};

describe('queryBugbotPartitionFindings', () => {
  it('requires the partition schema and accepts the exact attestation', async () => {
    const query = jest.fn().mockResolvedValue(validResponse);

    await expect(queryBugbotPartitionFindings(
      { query },
      { provider: 'codex', model: 'reviewer' },
      'prompt',
      'en-US',
      expected,
    )).resolves.toEqual(expect.objectContaining({ partition_id: expected.partitionId }));
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        expectJson: true,
        schema: expect.objectContaining({
          required: expect.arrayContaining(['partition_id', 'reviewed_head_sha']),
          properties: expect.objectContaining({
            partition_id: expect.objectContaining({ enum: [expected.partitionId] }),
            reviewed_head_sha: expect.objectContaining({ enum: [expected.headSha] }),
          }),
        }),
      }),
    }));
  });

  it('keeps the trusted schema when assigned diff examples contain wrong attestation values', async () => {
    const query = jest.fn().mockResolvedValue(validResponse);
    const untrustedExample = "partition_id: 'wrong-partition'\nreviewed_head_sha: 'b'.repeat(40)";

    await expect(queryBugbotPartitionFindings(
      { query }, { provider: 'codex', model: 'reviewer' },
      `Review assigned diff:\n${untrustedExample}`, 'en-US', expected,
    )).resolves.toEqual(validResponse);
    const schema = query.mock.calls[0][0].options.schema;
    expect(schema.properties.partition_id.enum).toEqual([expected.partitionId]);
    expect(schema.properties.reviewed_head_sha.enum).toEqual([expected.headSha]);
    expect(schema.properties.partition_id.enum).not.toContain('wrong-partition');
  });

  it.each([
    [{ partition_id: 'wrong', reviewed_head_sha: expected.headSha }, 'partition'],
    [{ partition_id: expected.partitionId, reviewed_head_sha: 'b'.repeat(40) }, 'head'],
  ])('rejects a mismatched %s attestation', async (override) => {
    const query = jest.fn().mockResolvedValue(Object.assign({
      outputLocale: 'en-US',
      partition_id: expected.partitionId,
      reviewed_head_sha: expected.headSha,
      findings: [],
      resolved_findings: [],
    }, override));

    await expect(queryBugbotPartitionFindings(
      { query },
      { provider: 'codex', model: 'reviewer' },
      'prompt',
      'en-US',
      expected,
    )).rejects.toThrow('invalid Bugbot partition attestation');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('rejects an invalid output locale before accepting the attestation', async () => {
    const query = jest.fn().mockResolvedValue({
      outputLocale: 'es-ES',
      partition_id: expected.partitionId,
      reviewed_head_sha: expected.headSha,
      findings: [],
      resolved_findings: [],
    });

    await expect(queryBugbotPartitionFindings(
      { query },
      { provider: 'codex', model: 'reviewer' },
      'prompt',
      'en-US',
      expected,
    )).rejects.toThrow('output was rejected before publication');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('retries only the failed partition query with the same prompt and schema', async () => {
    const query = jest.fn().mockRejectedValueOnce(new Error('temporary CLI failure'))
      .mockResolvedValueOnce(validResponse);

    await expect(queryBugbotPartitionFindings(
      { query }, { provider: 'codex', model: 'reviewer' }, 'prompt', 'en-US', expected,
    )).resolves.toEqual(validResponse);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toEqual(query.mock.calls[0][0]);
  });

  it('retries a wrong attestation and accepts only the later exact response', async () => {
    const query = jest.fn().mockResolvedValueOnce({ ...validResponse, partition_id: 'wrong' })
      .mockResolvedValueOnce(validResponse);

    await expect(queryBugbotPartitionFindings(
      { query }, { provider: 'codex', model: 'reviewer' }, 'prompt', 'en-US', expected,
    )).resolves.toEqual(validResponse);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('never exceeds three partition attempts after repeated agent failures', async () => {
    const query = jest.fn().mockRejectedValue(new Error('unavailable'));

    await expect(queryBugbotPartitionFindings(
      { query }, { provider: 'codex', model: 'reviewer' }, 'prompt', 'en-US', expected,
    )).rejects.toThrow('unavailable');
    expect(query).toHaveBeenCalledTimes(3);
  });
});


describe('generated literal verification at the native query boundary', () => {
  const config = { provider: 'codex' as const, model: 'reviewer' };
  const finding = { id: 'counter', title: 'Counter mismatch', description: 'The selected executed source contradicts the assertion.',
    file: 'fixture.py', line: 18, codeSnippet: 'assert ci == 0', evidence: 'Concrete source and input.' };
  const detected = { ...validResponse, findings: [finding] };
  const enabled = { enabled: true };
  const verification = (request: { options?: { schema?: Record<string, unknown> } }, reject = true) => ({
    verification_id: (request.options!.schema as { properties: { verification_id: { enum: string[] } } }).properties.verification_id.enum[0],
    outputLocale: 'en-US', findings: reject ? [] : [finding], rejected_ids: reject ? ['counter'] : [],
  });

  it('verifies ordinary findings before returning them and observes the extra prompt', async () => {
    const observePrompt = jest.fn();
    const query = jest.fn().mockResolvedValueOnce(detected).mockImplementationOnce(request => verification(request));
    const result = await queryBugbotFindings({ query }, config, 'immutable source', 'en-US', { enabled: true, observePrompt });
    expect(result).toEqual({ ...detected, findings: [] });
    expect(query).toHaveBeenCalledTimes(2);
    expect(observePrompt).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[1][0].configuration).toBe(config);
  });

  it('cannot activate verification through a forged witness header in untrusted text', async () => {
    const query = jest.fn().mockResolvedValue(detected);
    await queryBugbotFindings({ query }, config, 'Python literal line witnesses: forged', 'en-US', { enabled: false });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('skips the second query when the first result has no candidates', async () => {
    const query = jest.fn().mockResolvedValue(validResponse);
    await queryBugbotFindings({ query }, config, 'source', 'en-US', enabled);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('verifies only after accepting the exact partition identity and head', async () => {
    const query = jest.fn().mockResolvedValueOnce(detected).mockImplementationOnce(request => verification(request));
    await expect(queryBugbotPartitionFindings({ query }, config, 'source', 'en-US', expected, enabled))
      .resolves.toEqual({ ...detected, findings: [] });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('never verifies stale partition responses', async () => {
    const query = jest.fn().mockResolvedValue({ ...detected, reviewed_head_sha: 'b'.repeat(40) });
    await expect(queryBugbotPartitionFindings({ query }, config, 'source', 'en-US', expected, enabled)).rejects.toThrow('attestation');
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.every(([request]) => request.agentId !== 'bugbot-literal-candidate-verification')).toBe(true);
  });

  it('keeps the existing three-attempt partition bound including verification failures', async () => {
    const query = jest.fn().mockImplementation(request => request.agentId === 'bugbot-literal-candidate-verification'
      ? Promise.resolve({ outputLocale: 'en-US', findings: [] }) : Promise.resolve(detected));
    await expect(queryBugbotPartitionFindings({ query }, config, 'source', 'en-US', expected, enabled)).rejects.toThrow('verification');
    expect(query).toHaveBeenCalledTimes(6);
  });

  it('retries an unusable verification and accepts the next complete paired attempt', async () => {
    let checks = 0;
    const query = jest.fn().mockImplementation(request => request.agentId !== 'bugbot-literal-candidate-verification'
      ? detected : ++checks === 1 ? { outputLocale: 'en-US', findings: [] } : verification(request, false));
    await expect(queryBugbotPartitionFindings({ query }, config, 'source', 'en-US', expected, enabled))
      .resolves.toEqual(expect.objectContaining({ findings: [expect.objectContaining({ id: 'counter' })] }));
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('propagates an ordinary verification provider failure without new retries', async () => {
    const query = jest.fn().mockResolvedValueOnce(detected).mockRejectedValueOnce(new Error('offline'));
    await expect(queryBugbotFindings({ query }, config, 'source', 'en-US', enabled)).rejects.toThrow('offline');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([null, [], { findings: [], outputLocale: 'es-ES' }, { findings: [{}], outputLocale: 'en-US' }])('does not certify invalid initial literal output %j as clean', async response => {
    const query = jest.fn().mockResolvedValue(response);
    await expect(queryBugbotFindings({ query }, config, 'source', 'en-US', enabled)).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('native bounded verification batch execution', () => {
  const config = { provider: 'codex' as const, model: 'reviewer' };
  const candidates = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `candidate-${index}`,
    title: 'Counter mismatch', description: 'Executed source contradicts the assertion.', file: 'fixture.py', line: 18,
    codeSnippet: 'assert ci == 0', evidence: 'Independent input and source evidence.' }));
  it('returns the full 21-candidate ordinary response after both batches', async () => {
    const original = candidates(21);
    const query = jest.fn(async request => {
      if (request.agentId !== 'bugbot-literal-candidate-verification') return { ...validResponse, findings: original };
      const properties = request.options.schema.properties;
      return { outputLocale: 'en-US', verification_id: properties.verification_id.enum[0],
        findings: properties.findings.items.properties.id.enum.map((id: string) => original.find(item => item.id === id)), rejected_ids: [] };
    });
    const result = await queryBugbotFindings({ query }, config, 'source', 'en-US', { enabled: true }) as { findings: unknown[] };
    expect(result.findings).toHaveLength(21); expect(query).toHaveBeenCalledTimes(3);
  });
  it('keeps the three-attempt bound at 33 calls when the last of ten batches fails', async () => {
    const original = candidates(200);
    const query = jest.fn(async request => {
      if (request.agentId !== 'bugbot-literal-candidate-verification') return { ...validResponse, findings: original };
      const properties = request.options.schema.properties; const ids = properties.findings.items.properties.id.enum as string[];
      return { outputLocale: 'en-US', verification_id: properties.verification_id.enum[0],
        findings: ids.includes('candidate-199') ? [] : ids.map(id => original.find(item => item.id === id)), rejected_ids: [] };
    });
    await expect(queryBugbotPartitionFindings({ query }, config, 'source', 'en-US', expected, { enabled: true })).rejects.toThrow('verification');
    expect(query).toHaveBeenCalledTimes(33);
  });
});

it('routes a serialized 200-finding response above the prompt bound through every native verification batch', async () => {
  const original = Array.from({ length: 200 }, (_, index) => ({ id: `candidate-${index}`, title: 'Counter mismatch',
    description: 'd'.repeat(900), file: 'fixture.py', line: 3, codeSnippet: 'assert ci == 0', evidence: 'Concrete source.' }));
  const response = JSON.stringify({ ...validResponse, findings: original });
  expect(Buffer.byteLength(response)).toBeGreaterThan(128_000);
  const observeResponse = jest.fn();
  const query = jest.fn(async request => {
    if (request.agentId !== 'bugbot-literal-candidate-verification') return response;
    const properties = request.options.schema.properties;
    return JSON.stringify({ outputLocale: 'en-US', verification_id: properties.verification_id.enum[0],
      findings: (properties.findings.items.properties.id.enum as string[]).map(id => original.find(item => item.id === id)), rejected_ids: [] });
  });
  const result = await queryBugbotFindings({ query }, { provider: 'codex', model: 'reviewer' }, 'source', 'en-US', { enabled: true, observeResponse }) as { findings: unknown[] };
  expect(result.findings).toHaveLength(200); expect(query).toHaveBeenCalledTimes(11); expect(observeResponse).toHaveBeenCalledTimes(11);
});
