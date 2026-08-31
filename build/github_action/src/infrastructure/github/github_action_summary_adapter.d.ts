import type { ActionSummaryPort } from '../../application/ports/action_summary_ports';
interface GithubSummaryClient {
    addRaw(summaryText: string): GithubSummaryClient;
    write(): Promise<unknown>;
}
/** Writes an application-generated summary to the current GitHub Actions job. */
export declare class GithubActionSummaryAdapter implements ActionSummaryPort {
    private readonly summary;
    constructor(summary?: GithubSummaryClient | null);
    publish(summaryText: string): Promise<void>;
}
export {};
