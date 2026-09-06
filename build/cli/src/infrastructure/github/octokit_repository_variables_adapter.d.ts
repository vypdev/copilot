import type { GithubClientPort } from './ports/github_client_provider_port';
import type { GithubRepositoryVariablesClient } from './ports/github_repository_variables_protocol';
export declare class OctokitRepositoryVariablesClientAdapter implements GithubClientPort<GithubRepositoryVariablesClient> {
    getClient(token: string): GithubRepositoryVariablesClient;
}
