/** Output port for publishing a GitHub Actions job summary. */
export interface ActionSummaryPort {
    publish(summary: string): Promise<void>;
}
