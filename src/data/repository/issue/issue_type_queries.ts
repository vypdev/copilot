import type { GithubGraphqlTransportClient } from "../../../infrastructure/github/ports/github_graphql_transport_port";

export interface IssueType {
  id: string;
  name: string;
}

interface IssueTypePage {
  organization: {
    issueTypes: {
      nodes: IssueType[];
      pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

const ISSUE_TYPES_QUERY = `
    query ($owner: String!, $after: String) {
        organization(login: $owner) {
            issueTypes(first: 100, after: $after) {
                nodes { id name }
                pageInfo { hasNextPage endCursor }
            }
        }
    }
`;

const ORGANIZATION_ID_QUERY = `
    query ($owner: String!) { organization(login: $owner) { id } }
`;

const CREATE_ISSUE_TYPE_MUTATION = `
    mutation ($ownerId: ID!, $name: String!, $description: String!, $color: IssueTypeColor!, $isEnabled: Boolean!) {
        createIssueType(input: { ownerId: $ownerId, name: $name, description: $description, color: $color, isEnabled: $isEnabled }) {
            issueType { id }
        }
    }
`;

export async function listIssueTypes(
  client: GithubGraphqlTransportClient,
  owner: string,
): Promise<IssueType[]> {
  const issueTypes: IssueType[] = [];
  let cursor: string | null = null;
  for (let page = 1; page <= 100; page += 1) {
    const response: IssueTypePage = await client.graphql<IssueTypePage>(ISSUE_TYPES_QUERY, { owner, after: cursor });
    const organization: IssueTypePage["organization"] = response.organization;
    if (!organization) throw new Error(`Could not resolve the organization ${owner}`);
    issueTypes.push(...organization.issueTypes.nodes);
    const pageInfo: NonNullable<IssueTypePage["organization"]>["issueTypes"]["pageInfo"] = organization.issueTypes.pageInfo;
    if (!pageInfo?.hasNextPage) return issueTypes;
    if (!pageInfo.endCursor) {
      throw new Error(`Issue type pagination did not return a cursor on page ${page}.`);
    }
    cursor = pageInfo.endCursor;
  }
  throw new Error('Issue type pagination exceeded 100 pages.');
}

export async function createIssueType(
  client: GithubGraphqlTransportClient,
  owner: string,
  name: string,
  description: string,
  color: string,
): Promise<string> {
  const response = await client.graphql<{ organization: { id: string } | null }>(
    ORGANIZATION_ID_QUERY,
    { owner },
  );
  if (!response.organization) throw new Error(`Could not resolve the organization ${owner}`);

  const result = await client.graphql<{ createIssueType: { issueType: { id: string } } }>(
    CREATE_ISSUE_TYPE_MUTATION,
    {
      ownerId: response.organization.id,
      name,
      description,
      color: color.toUpperCase(),
      isEnabled: true,
    },
  );
  return result.createIssueType.issueType.id;
}
