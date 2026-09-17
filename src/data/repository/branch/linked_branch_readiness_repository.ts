import type { LinkedBranchReadinessPort, LinkedBranchEvidence } from '../../../application/ports/linked_branch_readiness_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';

interface Response {
  readonly repository?: {
    readonly issue?: {
      readonly linkedBranches?: {
        readonly nodes?: ReadonlyArray<{
          readonly ref?: { readonly name?: string; readonly target?: { readonly oid?: string } };
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
    const response = await this.client.getClient(token).graphql<Response>(`
      query ($owner: String!, $repository: String!, $issueNumber: Int!) {
        repository(owner: $owner, name: $repository) {
          issue(number: $issueNumber) {
            linkedBranches(first: 100) {
              nodes { ref { name target { ... on Commit { oid } } } }
            }
          }
        }
      }
    `, { owner, repository, issueNumber });
    const expected = branchName.trim();
    if (!expected || expected.startsWith('/') || expected.includes('..')) return undefined;
    const match = response.repository?.issue?.linkedBranches?.nodes?.find(node => {
      const name = node?.ref?.name;
      return name === expected || name === `refs/heads/${expected}` || name === `/${expected}`;
    });
    const sha = match?.ref?.target?.oid;
    return typeof sha === 'string' && /^[a-f0-9]{40}$/i.test(sha)
      ? Object.freeze({ name: expected, headSha: sha.toLowerCase() })
      : undefined;
  }
}
