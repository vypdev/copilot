/** Read transport only: no mutation method is exposed to candidate inspection. */
export interface GithubCandidateReplacementProviderClient {
  request<T>(route: string, parameters: Record<string, unknown>): Promise<{ data: T }>;
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
}
