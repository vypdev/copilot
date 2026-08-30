interface PriorityLabels {
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;
}

export function resolveGithubPriorityLabel(
  priority: string,
  labels: PriorityLabels,
): "P0" | "P1" | "P2" | undefined {
  const byLabel: Record<string, "P0" | "P1" | "P2"> = {
    [labels.priorityHigh]: "P0",
    [labels.priorityMedium]: "P1",
    [labels.priorityLow]: "P2",
  };
  return byLabel[priority];
}
