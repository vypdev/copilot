export interface BugbotPartitionCompletionInput {
  readonly reviewDiffPartitions?: readonly unknown[];
  readonly reviewDiffFragmentCount?: number;
  readonly reviewDiffIgnoredFileCount?: number;
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
  if (partitions === 0) {
    const ignored = input.reviewDiffIgnoredFileCount ?? 0;
    return ignored > 0
      ? {
          dryRunSuffix: ` after safely skipping ${ignored} ignored changed ${ignored === 1 ? 'file' : 'files'}`,
          resultStep: `${ignored} changed ${ignored === 1 ? 'file was' : 'files were'} intentionally ignored; no reviewer query or prior-finding resolution ran`,
        }
      : { dryRunSuffix: '' };
  }
  const fragments = input.reviewDiffFragmentCount ?? 0;
  const partitionNoun = partitions === 1 ? 'partition' : 'partitions';
  const fragmentNoun = fragments === 1 ? 'fragment' : 'fragments';
  return {
    dryRunSuffix: ` after atomically completing ${partitions} diff ${partitionNoun}`,
    resultStep: `${partitions} diff ${partitionNoun} completed atomically across ${fragments} ${fragmentNoun}`,
  };
}
