import type { GithubClientPort } from './ports/github_client_provider_port';
import type { GithubCredentialHealthClient } from './ports/github_credential_health_protocol';
export declare class OctokitCredentialHealthClientAdapter implements GithubClientPort<GithubCredentialHealthClient> {
    getClient(token: string): GithubCredentialHealthClient;
}
