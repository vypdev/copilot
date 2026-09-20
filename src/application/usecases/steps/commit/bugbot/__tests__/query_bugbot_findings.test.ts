import { queryBugbotPartitionFindings } from '../query_bugbot_findings';

const expected = {
  partitionId: 'diff-1-of-2-12345678',
  headSha: 'a'.repeat(40),
};

describe('queryBugbotPartitionFindings', () => {
  it('requires the partition schema and accepts the exact attestation', async () => {
    const query = jest.fn().mockResolvedValue({
      outputLocale: 'en-US',
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
  });
});
