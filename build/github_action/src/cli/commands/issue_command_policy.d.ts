import type { GitInfo } from '../../cli_context';
export interface IssueCommandOptions {
    issue?: string;
    branch?: string;
    debug?: boolean;
    token?: string;
}
export declare function parseIssueNumber(value: unknown): number | undefined;
export declare function buildCheckProgressParams(options: IssueCommandOptions, gitInfo: GitInfo): any | undefined;
export declare function buildRecommendStepsParams(options: IssueCommandOptions, gitInfo: GitInfo): any | undefined;
