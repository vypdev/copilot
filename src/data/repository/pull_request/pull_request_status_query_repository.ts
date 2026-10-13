import { readCurrentBaseRevision } from './current_base_revision_query';
import * as github from '@actions/github';
import type { LinkedStatusPullRequests } from '../../../application/ports/pull_request_status_read_ports';
import type { ApprovalObservationTarget } from '../../../application/ports/pull_request_approval_ports';
import type { ReadinessRevision } from '../../../application/policies/pull_request_readiness_policy';
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
interface LinkResponse { repository?: { databaseId?: number; nameWithOwner?: string; issue?: { number?: number;
    closedByPullRequestsReferences?: { totalCount?: number; pageInfo?: { hasNextPage?: boolean }; nodes?: readonly ({ number?: number;
        state?: string; repository?: { databaseId?: number }; headRepository?: { databaseId?: number } } | null)[] } | null } | null } | null }
/** Bounded native linkage and fresh identity reads. No mutations or provider DTOs cross this boundary. */
export class PullRequestStatusQueryRepository {
    private readonly octokit;
    constructor(private readonly owner: string, private readonly repository: string, token: string) { this.octokit = github.getOctokit(token); }
    async readLinkedPullRequests(issueNumber: number): Promise<LinkedStatusPullRequests> {
        if (!integer(issueNumber)) return { state: 'unavailable' };
        try {
            const response = await this.octokit.graphql<LinkResponse>(`query ($owner: String!, $repository: String!, $issue: Int!) {
                repository(owner: $owner, name: $repository) { databaseId nameWithOwner issue(number: $issue) { number
                    closedByPullRequestsReferences(first: 100, includeClosedPrs: false) {
                        totalCount pageInfo { hasNextPage } nodes { number state repository { databaseId } headRepository { databaseId } }
                    } } } }`, { owner: this.owner, repository: this.repository, issue: issueNumber });
            const repo = response.repository; const issue = repo?.issue; const links = issue?.closedByPullRequestsReferences;
            if (!integer(repo?.databaseId) || repo?.nameWithOwner?.toLowerCase() !== `${this.owner}/${this.repository}`.toLowerCase()
                || issue?.number !== issueNumber || !links || !Array.isArray(links.nodes) || links.nodes.length > 100
                || links.pageInfo?.hasNextPage !== false || links.totalCount !== links.nodes.length) return { state: 'unavailable' };
            const numbers: number[] = [];
            for (const pull of links.nodes) {
                if (!pull || !integer(pull.number) || pull.state !== 'OPEN' || pull.repository?.databaseId !== repo.databaseId
                    || pull.headRepository?.databaseId !== repo.databaseId || numbers.includes(pull.number)) return { state: 'unavailable' };
                numbers.push(pull.number);
            }
            return Object.freeze({ state: 'available', repositoryId: repo.databaseId, issueNumber, numbers: Object.freeze(numbers) });
        } catch { return { state: 'unavailable' }; }
    }
    async readRevision(target: ApprovalObservationTarget): Promise<ReadinessRevision> {
        if (target.owner.toLowerCase() !== this.owner.toLowerCase() || target.repository.toLowerCase() !== this.repository.toLowerCase()
            || !integer(target.repositoryId) || !integer(target.pullNumber)) throw new Error('Status target unavailable.');
        const { data: pull } = await this.octokit.rest.pulls.get({ owner: this.owner, repo: this.repository, pull_number: target.pullNumber });
        if (pull.state !== 'open' || pull.number !== target.pullNumber || pull.base.repo?.id !== target.repositoryId || pull.head.repo?.id !== target.repositoryId
            || !sha(pull.head.sha) || !sha(pull.base.sha)) throw new Error('Status revision unavailable.');
        const baseSha = await readCurrentBaseRevision(this.octokit.rest.git,
            { owner: this.owner, repository: this.repository }, pull.base.ref);
        return Object.freeze({ repositoryId: target.repositoryId, pullNumber: target.pullNumber, headSha: pull.head.sha, baseSha });
    }
}
