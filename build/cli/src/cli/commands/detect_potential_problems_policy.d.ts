import type { GitInfo } from '../../cli_context';
export interface DetectProblemsOptions {
    issue?: string;
    branch?: string;
    debug?: boolean;
    token?: string;
}
export declare function buildDetectPotentialProblemsParams(options: DetectProblemsOptions, gitInfo: GitInfo, currentBranch: string): any | undefined;
export declare function resolveDetectIssueNumber(value: unknown): number | undefined;
