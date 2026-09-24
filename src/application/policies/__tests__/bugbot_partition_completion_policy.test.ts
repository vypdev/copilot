import { formatBugbotPartitionCompletion } from '../bugbot_partition_completion_policy';

describe('formatBugbotPartitionCompletion', () => {
  it('omits completion copy when no partition plan exists', () => {
    expect(formatBugbotPartitionCompletion({})).toEqual({ dryRunSuffix: '' });
    expect(formatBugbotPartitionCompletion({ reviewDiffPartitions: [] })).toEqual({ dryRunSuffix: '' });
  });

  it('renders singular partition and fragment copy', () => {
    expect(formatBugbotPartitionCompletion({
      reviewDiffPartitions: [{}],
      reviewDiffFragmentCount: 1,
    })).toEqual({
      dryRunSuffix: ' after atomically completing 1 diff partition',
      resultStep: '1 diff partition completed atomically across 1 fragment',
    });
  });

  it('renders an explicit zero-work result for ignored-only canonical changes', () => {
    expect(formatBugbotPartitionCompletion({
      reviewDiffPartitions: [],
      reviewDiffIgnoredFileCount: 2,
    })).toEqual({
      dryRunSuffix: ' after safely skipping 2 ignored changed files',
      resultStep: '2 changed files were intentionally ignored; no reviewer query or prior-finding resolution ran',
    });
    expect(formatBugbotPartitionCompletion({
      reviewDiffPartitions: [],
      reviewDiffIgnoredFileCount: 1,
    }).resultStep).toContain('1 changed file was');
  });

  it('renders plural copy and uses a safe fragment fallback', () => {
    expect(formatBugbotPartitionCompletion({
      reviewDiffPartitions: [{}, {}],
    })).toEqual({
      dryRunSuffix: ' after atomically completing 2 diff partitions',
      resultStep: '2 diff partitions completed atomically across 0 fragments',
    });
    expect(formatBugbotPartitionCompletion({
      reviewDiffPartitions: [{}, {}],
      reviewDiffFragmentCount: 2,
    }).resultStep).toContain('2 fragments');
  });
});
