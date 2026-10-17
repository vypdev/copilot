/** Narrow transport used only by fixed GitHub setup routes in the adapters. */
export interface GithubSetupBatchClient {
  request(route: string, parameters: Record<string, unknown>): Promise<{ readonly data: unknown }>;
}
