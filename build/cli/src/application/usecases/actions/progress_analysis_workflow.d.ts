import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import type { BranchListQueryPort } from '../../ports/branch_lifecycle_ports';
import { type ProgressAttemptResult } from './progress_response';
export interface ProgressAnalysisDependencies {
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    branchRepository: BranchListQueryPort;
    aiRepository: FindingsQueryPort;
}
export type ProgressAnalysis = {
    kind: 'failure';
    result: Result;
} | {
    kind: 'ready';
    issueNumber: number;
    branch: string;
    developmentBranch: string;
    attemptResult: ProgressAttemptResult;
};
/** Loads progress context and asks the configured agent for an assessment. */
export declare function analyzeProgress(param: Execution, taskId: string, dependencies: ProgressAnalysisDependencies): Promise<ProgressAnalysis>;
