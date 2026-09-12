import { Result } from '../../model/result';
import { ApplicationError, toApplicationError } from '../../../application/errors/application_error';

const RESULT_ID = 'branch_repository';

export function missingLinkedBranchContextResult(branchName: string, issueNumber: number, ids: { repositoryId?: string; issueId?: string; branchOid?: string }): Result {
    return new Result({
        id: RESULT_ID,
        success: false,
        executed: true,
        steps: [`Error linking branch ${branchName} to issue: Repository not found.`],
        errors: [new ApplicationError(
            'provider.contract-invalid',
            `The branch provider returned incomplete context for issue #${issueNumber}.`,
            { cause: ids },
        )],
    });
}

export function missingLinkedBranchResult(branchName: string): Result {
    return new Result({ id: RESULT_ID, success: false, executed: true, steps: [`Linked branch creation returned no linked branch for ${branchName}.`] });
}

export function unexpectedLinkedBranchResult(branchName: string): Result {
    return new Result({ id: RESULT_ID, success: false, executed: true, steps: [`Linked branch creation returned an unexpected branch ref for ${branchName}.`] });
}

export function createdLinkedBranchResult(owner: string, repo: string, baseBranchName: string, newBranchName: string, baseSha: string): Result {
    return new Result({
        id: RESULT_ID,
        success: true,
        executed: true,
        payload: {
            baseBranchName,
            baseSha,
            baseBranchUrl: `https://github.com/${owner}/${repo}/tree/${baseBranchName}`,
            newBranchName,
            newBranchUrl: `https://github.com/${owner}/${repo}/tree/${newBranchName}`,
        },
    });
}

export function idempotentLinkedBranchResult(): Result {
    return new Result({ id: RESULT_ID, success: true, executed: false });
}

export function linkedBranchFailureResult(error: unknown): Result {
    return new Result({
        id: RESULT_ID,
        success: false,
        executed: true,
        steps: ['Tried to link branch to the issue, but there was a problem.'],
        errors: [toApplicationError(error, 'provider.unavailable', 'Unable to link the branch to the issue.')],
    });
}
