import type { ManagedPullRequestRecord } from '../../../application/ports/deployment_orchestration_ports';
import { ApplicationError, toApplicationError } from '../../../application/errors/application_error';
import type { GithubDeploymentClient } from '../../../infrastructure/github/ports/github_deployment_provider_port';
import { parseManagedPullRequestMarker } from '../../../domain/managed_pull_request';

interface Snapshot {
    repository?: {
        nameWithOwner?: string;
        issue?: { id?: string; number?: number } | null;
        pullRequest?: {
            id?: string; number?: number; state?: string; body?: string | null;
            headRefName?: string; headRefOid?: string; baseRefName?: string;
            headRepository?: { nameWithOwner?: string } | null;
            closingIssuesReferences?: {
                nodes?: Array<{ number?: number; repository?: { nameWithOwner?: string } | null } | null>;
                pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            };
        } | null;
    } | null;
}

const query = `query DeploymentIssueCompletion($owner: String!, $repo: String!, $number: Int!, $issue: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
        nameWithOwner
        issue(number: $issue) { id number }
        pullRequest(number: $number) {
            id number state body headRefName headRefOid baseRefName
            headRepository { nameWithOwner }
            closingIssuesReferences(first: 100, after: $cursor) {
                nodes { number repository { nameWithOwner } }
                pageInfo { hasNextPage endCursor }
            }
        }
    }
}`;

/** Detach only the verified operation's launcher reference before native merge handoff. */
export async function prepareManagedIssueCompletion(
    client: Pick<GithubDeploymentClient, 'graphql'>, owner: string, repository: string,
    expected: ManagedPullRequestRecord,
): Promise<void> {
    if (typeof expected.body !== 'string' || typeof expected.repositoryFullName !== 'string'
        || typeof expected.nodeId !== 'string' || !expected.nodeId
        || typeof expected.headBranch !== 'string' || !expected.headBranch
        || typeof expected.baseBranch !== 'string' || !expected.baseBranch
        || typeof expected.headSha !== 'string') throw invalid();
    const marker = parseManagedPullRequestMarker(expected.body);
    const fullName = `${owner}/${repository}`.toLowerCase();
    if (!marker || !Number.isSafeInteger(expected.number) || expected.number < 1 || marker.issue === expected.number
        || !sameRepository(expected.repositoryFullName, fullName) || expected.state !== 'open' || expected.merged !== false
        || !/^[a-f0-9]{40}$/iu.test(expected.headSha)) throw invalid();
    const read = async (cursor: string | null) => {
        const snapshot = await client.graphql<Snapshot>(query, { owner, repo: repository, number: expected.number,
            issue: marker.issue, cursor });
        const resource = snapshot?.repository;
        const issue = resource?.issue;
        const pr = resource?.pullRequest;
        const identity = parseManagedPullRequestMarker(pr?.body);
        if (!sameRepository(resource?.nameWithOwner, fullName) || typeof issue?.id !== 'string' || !issue.id || issue.number !== marker.issue
            || pr?.id !== expected.nodeId || pr.number !== expected.number || pr.state !== 'OPEN'
            || !sameRepository(pr.headRepository?.nameWithOwner, fullName)
            || pr.headRefName !== expected.headBranch || pr.headRefOid !== expected.headSha || pr.baseRefName !== expected.baseBranch
            || !identity || identity.operationId !== marker.operationId || identity.phase !== marker.phase || identity.issue !== marker.issue
            || pr.body!.split('<!-- copilot-deployment operation-id=').length !== 2) throw invalid();
        const refs = pr.closingIssuesReferences;
        if (!Array.isArray(refs?.nodes) || refs.nodes.length > 100 || typeof refs.pageInfo?.hasNextPage !== 'boolean'
            || refs.nodes.some(node => !node || !Number.isSafeInteger(node.number) || node.number! < 1
                || typeof node.repository?.nameWithOwner !== 'string' || !node.repository.nameWithOwner)) throw invalid();
        return { issueId: issue.id, prId: pr.id, refs };
    };
    try {
        const before = await read(null);
        const response = await client.graphql<{ removeCloseIssueReferences?: { issue?: { id?: string; number?: number } | null } | null }>(
            `mutation DeferDeploymentIssueCompletion($issueId: ID!, $pullRequestIds: [ID!]!) {
                removeCloseIssueReferences(input: { issueId: $issueId, pullRequestIds: $pullRequestIds }) {
                    issue { id number }
                }
            }`, { issueId: before.issueId, pullRequestIds: [before.prId] });
        if (response?.removeCloseIssueReferences?.issue?.id !== before.issueId
            || response.removeCloseIssueReferences.issue.number !== marker.issue) throw invalid();
        let cursor: string | null = null;
        for (let page = 0; page < 2; page++) {
            const current = await read(cursor);
            if (current.issueId !== before.issueId || current.prId !== before.prId) throw invalid();
            if (current.refs.nodes!.some(node => node!.number === marker.issue
                && node!.repository!.nameWithOwner!.toLowerCase() === fullName)) {
                throw new ApplicationError('provider.conflict', 'The managed PR still closes its deployment launcher. Inspect closing keywords and native closing references, then retry the stored promotion or reconciliation phase.');
            }
            if (!current.refs.pageInfo!.hasNextPage) return;
            const next = current.refs.pageInfo!.endCursor;
            if (typeof next !== 'string' || !next || next === cursor) throw invalid();
            cursor = next;
        }
        throw new ApplicationError('provider.contract-invalid', 'Deployment closing references exceed the fixed 200-reference inspection bound.');
    } catch (cause) {
        throw toApplicationError(cause, 'provider.unavailable', 'The managed PR launcher closing reference could not be safely deferred. Inspect native closing references and retry; automatic merge was not authorized.');
    }
}

function invalid(): ApplicationError {
    return new ApplicationError('provider.contract-invalid', 'Native deployment PR, launcher, ownership or closing-reference evidence changed or is incomplete.');
}

function sameRepository(value: unknown, fullName: string): boolean {
    return typeof value === 'string' && value.toLowerCase() === fullName;
}
