import type { SddDiffPullRequestLinkPort, SddDiffPullRequestLinks } from '../../../application/ports/sdd_diff_read_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubGraphqlTransportClient } from '../../../infrastructure/github/ports/github_graphql_transport_port';

interface Binding { readonly owner: string; readonly repository: string; readonly repositoryId: number; readonly token: string }
const QUERY = `query SddDiffClosingIssues($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    databaseId nameWithOwner
    pullRequest(number: $number) {
      number headRefOid headRefName headRepository { databaseId nameWithOwner } repository { databaseId nameWithOwner }
      closingIssuesReferences(first: 100) {
        totalCount pageInfo { hasNextPage }
        nodes { number author { login } repository { databaseId nameWithOwner } }
      }
    }
  }
}`;

/** One bounded native read; absent, incomplete or conflicting identities never become guessed links. */
export class SddDiffLinkRepository implements SddDiffPullRequestLinkPort {
  private readonly binding: Readonly<Binding>;
  constructor(private readonly client: GithubClientPort<GithubGraphqlTransportClient>, binding: Binding) {
    this.binding = Object.freeze({ ...binding });
  }

  async readClosingIssues(pullNumber: number): Promise<SddDiffPullRequestLinks> {
    const unavailable = Object.freeze({ state: 'unavailable' as const });
    const binding = this.binding;
    if (!positive(pullNumber) || !positive(binding.repositoryId)
      || ![binding.owner, binding.repository].every(value => /^[A-Za-z0-9_.-]{1,100}$/u.test(value) && !['.', '..'].includes(value))) return unavailable;
    try {
      const response = object(await this.client.getClient(binding.token).graphql<unknown>(QUERY, {
        owner: binding.owner, repo: binding.repository, number: pullNumber,
      }));
      const repository = object(response?.repository);
      const pull = object(repository?.pullRequest);
      const links = object(pull?.closingIssuesReferences);
      const page = object(links?.pageInfo);
      if (!sameRepository(repository, binding) || !sameRepository(object(pull?.repository), binding)
        || !sameRepository(object(pull?.headRepository), binding)
        || typeof pull?.headRefName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,249}$/u.test(pull.headRefName)
        || pull?.number !== pullNumber || typeof pull.headRefOid !== 'string' || !/^[a-f0-9]{40}$/u.test(pull.headRefOid)
        || page?.hasNextPage !== false || !Array.isArray(links?.nodes)
        || !Number.isSafeInteger(links.totalCount) || links.totalCount !== links.nodes.length || links.nodes.length > 100) return unavailable;
      const numbers: number[] = [];
      const authors: Record<number, string> = {};
      for (const value of links.nodes) {
        const issue = object(value);
        const author = object(issue?.author);
        if (typeof author?.login !== 'string' || !author.login.trim() || author.login.length > 100
          || !positive(issue?.number) || !sameRepository(object(issue?.repository), binding)
          || numbers.includes(issue.number)) return unavailable;
        numbers.push(issue.number);
        authors[issue.number] = author.login;
      }
      return Object.freeze({ state: 'verified', pullNumber, headSha: pull.headRefOid, headBranch: pull.headRefName,
        issueNumbers: Object.freeze(numbers.sort((left, right) => left - right)), issueAuthors: Object.freeze(authors) });
    } catch { return unavailable; }
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function sameRepository(value: Record<string, unknown> | undefined, binding: Binding): boolean {
  return value?.databaseId === binding.repositoryId && typeof value.nameWithOwner === 'string'
    && value.nameWithOwner.toLowerCase() === `${binding.owner}/${binding.repository}`.toLowerCase();
}
