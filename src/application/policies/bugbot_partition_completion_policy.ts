export interface BugbotPartitionCompletionInput {
  readonly reviewDiffPartitions?: readonly unknown[];
  readonly reviewDiffFragmentCount?: number;
}

export interface BugbotPartitionCompletionCopy {
  readonly dryRunSuffix: string;
  readonly resultStep?: string;
}

/** Builds consistent workflow copy for an atomically completed diff plan. */
export function formatBugbotPartitionCompletion(
  input: BugbotPartitionCompletionInput,
): BugbotPartitionCompletionCopy {
  const partitions = input.reviewDiffPartitions?.length ?? 0;
  if (partitions === 0) return { dryRunSuffix: '' };
  const fragments = input.reviewDiffFragmentCount ?? 0;
  const partitionNoun = partitions === 1 ? 'partition' : 'partitions';
  const fragmentNoun = fragments === 1 ? 'fragment' : 'fragments';
  return {
    dryRunSuffix: ` after atomically completing ${partitions} diff ${partitionNoun}`,
    resultStep: `${partitions} diff ${partitionNoun} completed atomically across ${fragments} ${fragmentNoun}`,
  };
}
