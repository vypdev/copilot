import { Result } from '../../model/result';
export declare function missingLinkedBranchContextResult(branchName: string, issueNumber: number, ids: {
    repositoryId?: string;
    issueId?: string;
    branchOid?: string;
}): Result;
export declare function missingLinkedBranchResult(branchName: string): Result;
export declare function unexpectedLinkedBranchResult(branchName: string): Result;
export declare function createdLinkedBranchResult(owner: string, repo: string, baseBranchName: string, newBranchName: string): Result;
export declare function idempotentLinkedBranchResult(): Result;
export declare function linkedBranchFailureResult(error: unknown): Result;
