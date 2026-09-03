import type { Execution } from '../../data/model/execution';
import { Result } from '../../data/model/result';
export interface CopilotStatusSnapshot {
    readonly owner: string;
    readonly repository: string;
    readonly event: string;
    readonly action: string;
    readonly target: 'issue' | 'pull-request' | 'push' | 'repository';
    readonly issueNumber?: number;
    readonly pullRequestNumber?: number;
    readonly branch?: string;
    readonly lifecycle?: string;
    readonly waitingFor?: string;
    readonly issueLabels: readonly string[];
    readonly pullRequestLabels: readonly string[];
    readonly activeFindings?: {
        open: number;
        reopened: number;
        resolved: number;
    };
    readonly pullRequestDescriptionMode: string;
}
/** Builds a read-only status snapshot from the facts already loaded by setup. */
export declare function buildCopilotStatusSnapshot(execution: Execution): CopilotStatusSnapshot;
export declare function buildCopilotStatusResult(execution: Execution, taskId: string): Result;
export declare function formatCopilotStatus(snapshot: CopilotStatusSnapshot): string;
