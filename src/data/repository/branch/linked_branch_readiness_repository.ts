import type { LinkedBranchReadinessPort, LinkedBranchEvidence } from '../../../application/ports/linked_branch_readiness_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';

interface Response {
  readonly repository?: {
    readonly ref?: { readonly target?: { readonly oid?: string } } | null;
    readonly issue?: {
      readonly linkedBranches?: {
        readonly nodes?: ReadonlyArray<{
          readonly ref?: { readonly name?: string; readonly target?: { readonly oid?: string } };
        } | null>;
      };
      readonly closedByPullRequestsReferences?: {
        readonly nodes?: ReadonlyArray<{
          readonly state?: string;
          readonly headRefName?: string;
          readonly headRefOid?: string;
          readonly headRepository?: { readonly nameWithOwner?: string } | null;
        } | null>;
      };
    };
  };
}

/** Reads GitHub's issue linkage and the remote ref, rather than trusting a local ref or label. */
export class LinkedBranchReadinessRepository implements LinkedBranchReadinessPort {
  constructor(private readonly client: GithubClientPort<GithubGraphqlTransportClient>) {}

  async getLinkedBranch(
    owner: string,
    repository: string,
    issueNumber: number,
    branchName: string,
    token: string,
  ): Promise<LinkedBranchEvidence | undefined> {
    const expected = branchName.trim();
    if (!expected || expected.startsWith('/') || expected.includes('..')) return undefined;
    const response = await this.client.getClient(token).graphql<Response>(`
      query ($owner: String!, $repository: String!, $issueNumber: Int!, $ref: String!) {
        repository(owner: $owner, name: $repository) {
          ref(qualifiedName: $ref) { target { ... on Commit { oid } } }
          issue(number: $issueNumber) {
            linkedBranches(first: 100) {
              nodes { ref { name target { ... on Commit { oid } } } }
            }
            closedByPullRequestsReferences(first: 100) {
              nodes { state headRefName headRefOid headRepository { nameWithOwner } }
            }
          }
        }
      }
    `, { owner, repository, issueNumber, ref: `refs/heads/${expected}` });
    const match = response.repository?.issue?.linkedBranches?.nodes?.find(node => {
      const name = node?.ref?.name;
      return name === expected || name === `refs/heads/${expected}` || name === `/${expected}`;
    });
    const directlyLinkedSha = fullSha(match?.ref?.target?.oid);
    if (directlyLinkedSha) return Object.freeze({ name: expected, headSha: directlyLinkedSha });
    // GitHub removes linkedBranches when its branch becomes a linked PR.
    // Native issue association plus the exact same-repository live ref retains
    // that proof; a PR body or a stale/deleted head alone is insufficient.
    const remoteSha = fullSha(response.repository?.ref?.target?.oid);
    const linkedPullRequest = response.repository?.issue?.closedByPullRequestsReferences?.nodes?.find(pr =>
      pr?.state === 'OPEN' && pr.headRefName === expected
      && pr.headRepository?.nameWithOwner?.toLowerCase() === `${owner}/${repository}`.toLowerCase()
      && fullSha(pr.headRefOid) === remoteSha);
    return remoteSha && linkedPullRequest ? Object.freeze({ name: expected, headSha: remoteSha }) : undefined;
  }
}

function fullSha(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : undefined;
}
