interface PriorityLabels {
    priorityHigh: string;
    priorityMedium: string;
    priorityLow: string;
}
export declare function resolveGithubPriorityLabel(priority: string, labels: PriorityLabels): "P0" | "P1" | "P2" | undefined;
export {};
