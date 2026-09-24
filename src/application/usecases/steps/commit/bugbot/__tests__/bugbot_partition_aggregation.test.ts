import { ApplicationError } from '../../../../../errors/application_error';
import { aggregateBugbotPartitionResponses } from '../bugbot_partition_aggregation';
import type { BugbotReviewDiffPartition } from '../types';

function partition(ordinal: number, total = 2): BugbotReviewDiffPartition {
  return {
    id: `diff-${ordinal}-of-${total}-12345678`,
    ordinal,
    total,
    headSha: 'a'.repeat(40),
    block: `partition ${ordinal}`,
    files: [`src/${ordinal}.ts`],
    fragmentCount: 1,
    ownsResolution: ordinal === 1,
  };
}

function response(
  assigned: BugbotReviewDiffPartition,
  findings: unknown[] = [],
  resolved: unknown[] = [],
): Readonly<Record<string, unknown>> {
  return {
    outputLocale: 'en-US',
    partition_id: assigned.id,
    reviewed_head_sha: assigned.headSha,
    findings,
    resolved_findings: resolved,
  };
}

describe('Bugbot partition aggregation', () => {
  it('combines findings in plan order and accepts resolutions only from the owner', () => {
    const partitions = [partition(1), partition(2)];
    const aggregate = aggregateBugbotPartitionResponses(partitions, [
      response(partitions[0], [{ id: 'first' }], [{ id: 'old', resolution: 'fixed' }]),
      response(partitions[1], [{ id: 'second' }]),
    ]);

    expect(aggregate).toEqual({
      findings: [{ id: 'first' }, { id: 'second' }],
      resolved_findings: [{ id: 'old', resolution: 'fixed' }],
    });
  });

  it('rejects an incomplete response set', () => {
    const partitions = [partition(1), partition(2)];
    expect(() => aggregateBugbotPartitionResponses(partitions, [response(partitions[0])]))
      .toThrow(ApplicationError);
  });

  it('rejects stale, misplaced, or duplicated partition identity', () => {
    const partitions = [partition(1), partition(2)];
    expect(() => aggregateBugbotPartitionResponses(partitions, [
      response(partitions[0]),
      { ...response(partitions[1]), reviewed_head_sha: 'b'.repeat(40) },
    ])).toThrow('identity is missing, duplicated, or stale');
  });

  it('rejects resolution claims from a non-owner partition', () => {
    const partitions = [partition(1), partition(2)];
    expect(() => aggregateBugbotPartitionResponses(partitions, [
      response(partitions[0]),
      response(partitions[1], [], [{ id: 'old', resolution: 'fixed' }]),
    ])).toThrow('non-owner');
  });

  it('rejects per-response and aggregate model-output overflow', () => {
    const one = partition(1, 1);
    expect(() => aggregateBugbotPartitionResponses(
      [one],
      [response(one, Array.from({ length: 201 }, (_, id) => ({ id })))],
    )).toThrow('structured-output bounds');

    const partitions = Array.from({ length: 11 }, (_, index) => partition(index + 1, 11));
    expect(() => aggregateBugbotPartitionResponses(
      partitions,
      partitions.map((assigned) => response(
        assigned,
        Array.from({ length: 200 }, (_, id) => ({ id: `${assigned.ordinal}-${id}` })),
      )),
    )).toThrow('aggregate finding output');
  });
});
