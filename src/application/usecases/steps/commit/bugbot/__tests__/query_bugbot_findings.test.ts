import { queryBugbotPartitionFindings } from '../query_bugbot_findings';

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
        }),
      }),
    }));
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
