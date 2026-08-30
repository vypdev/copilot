import type { GithubClientPort } from './ports/github_client_provider_port';
import type { GithubChecksClient } from './ports/github_checks_provider_ports';
export declare class OctokitChecksClientAdapter implements GithubClientPort<GithubChecksClient> {
    getClient(token: string): GithubChecksClient;
}
