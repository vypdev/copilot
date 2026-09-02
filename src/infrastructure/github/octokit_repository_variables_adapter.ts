import { getOctokitClient } from './octokit_client_resolver';
import type { GithubClientPort } from './ports/github_client_provider_port';
import type { GithubRepositoryVariablesClient } from './ports/github_repository_variables_protocol';

export class OctokitRepositoryVariablesClientAdapter implements GithubClientPort<GithubRepositoryVariablesClient> {
    getClient(token: string): GithubRepositoryVariablesClient {
        return getOctokitClient<GithubRepositoryVariablesClient>(token);
    }
}
