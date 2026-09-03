import { type Result } from '../../data/model/result';
export interface ActionSummaryContext {
    readonly owner: string;
    readonly repository: string;
    readonly eventName: string;
    readonly issueNumber: number;
    readonly pullRequestNumber: number;
    readonly lifecycleState?: string;
    readonly pullRequestDescriptionMode?: string;
    readonly results: readonly Result[];
}
/** Builds a bounded, publication-safe GitHub Actions Job Summary. */
export declare function buildActionSummary(context: ActionSummaryContext): string;
