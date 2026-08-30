import type { GithubClientPort } from './ports/github_client_provider_port';
import type { GithubChecksClient } from './ports/github_checks_provider_ports';
import { getOctokitClient } from './octokit_client_resolver';

export class OctokitChecksClientAdapter implements GithubClientPort<GithubChecksClient> {
    getClient(token: string): GithubChecksClient {
        return getOctokitClient<GithubChecksClient>(token);
    }
}
