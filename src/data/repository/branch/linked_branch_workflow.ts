import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';
import { Result } from '../../model/result';
import { isGithubAlreadyExists } from '../github/github_error_policy';
import { logDebugInfo, logError, logInfo } from '../../../utils/logger';
import { createLinkedBranchMutation, loadLinkedBranchContext } from './linked_branch_graphql';
import { isExpectedLinkedBranchRef, qualifyLinkedBranchRef, resolveLinkedBranchIdentifiers } from './linked_branch_policy';
import { createdLinkedBranchResult, idempotentLinkedBranchResult, linkedBranchFailureResult, missingLinkedBranchContextResult, missingLinkedBranchResult, unexpectedLinkedBranchResult } from './linked_branch_result_policy';

export async function runCreateLinkedBranch(
    client: GithubClientPort<GithubGraphqlTransportClient>,
    owner: string,
    repo: string,
    baseBranchName: string,
    newBranchName: string,
    issueNumber: number,
    oid: string | undefined,
    token: string,
): Promise<Result[]> {
    try {
        logDebugInfo(`Creating linked branch ${newBranchName} from ${oid ?? baseBranchName}`);
        const qualifiedRef = qualifyLinkedBranchRef(baseBranchName);
        const graphql = client.getClient(token).graphql;
        const { repository } = await loadLinkedBranchContext(graphql, { repo, owner, issueNumber, ref: qualifiedRef });
        logDebugInfo(`Repository information retrieved: ${JSON.stringify(repository?.ref)}`);
        const identifiers = resolveLinkedBranchIdentifiers(repository, oid);
        if (!identifiers) {
            logError(`Error searching repository "${baseBranchName}" for issue #${issueNumber}.`);
            return [missingLinkedBranchContextResult(newBranchName, issueNumber, {
                repositoryId: repository?.id,
                issueId: repository?.issue?.id,
                branchOid: oid ?? repository?.ref?.target?.oid,
            })];
        }
        logDebugInfo(`Linking branch "${newBranchName}" (oid: ${identifiers.branchOid}) to issue #${issueNumber}`);
        const mutationResponse = await createLinkedBranchMutation(graphql, {
            issueId: identifiers.issueId,
            name: `/${newBranchName}`,
            repositoryId: identifiers.repositoryId,
            oid: identifiers.branchOid,
        });
        const linkedBranch = mutationResponse.createLinkedBranch?.linkedBranch;
        logDebugInfo(`Linked branch: ${JSON.stringify(linkedBranch)}`);
        if (linkedBranch == null) return [missingLinkedBranchResult(newBranchName)];
        if (!isExpectedLinkedBranchRef(linkedBranch.ref?.name, newBranchName)) return [unexpectedLinkedBranchResult(newBranchName)];
        return [createdLinkedBranchResult(owner, repo, baseBranchName, newBranchName)];
    } catch (error) {
        if (isGithubAlreadyExists(error)) {
            logInfo(`Linked branch ${newBranchName} already exists; treating the operation as idempotently complete.`);
            return [idempotentLinkedBranchResult()];
        }
        logError(`Error Linking branch "${error}"`);
        return [linkedBranchFailureResult(error)];
    }
}
