import * as core from '@actions/core';
import type { ActionSummaryPort } from '../../application/ports/action_summary_ports';

interface GithubSummaryClient {
    addRaw(summaryText: string): GithubSummaryClient;
    write(): Promise<unknown>;
}

/** Writes an application-generated summary to the current GitHub Actions job. */
export class GithubActionSummaryAdapter implements ActionSummaryPort {
    constructor(private readonly summary: GithubSummaryClient | null = core.summary) {}

    async publish(summaryText: string): Promise<void> {
        if (!this.summary || typeof this.summary.addRaw !== 'function' || typeof this.summary.write !== 'function') return;

        await this.summary.addRaw(summaryText).write();
    }
}
