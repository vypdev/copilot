import { getOctokitClient } from './octokit_client_resolver';
import type { GithubClientPort } from './ports/github_client_provider_port';
import type { GithubCredentialHealthClient } from './ports/github_credential_health_protocol';
import type { GithubTrustedCredentialHealthClient } from './ports/github_trusted_credential_health_protocol';

export class OctokitCredentialHealthClientAdapter implements GithubClientPort<GithubCredentialHealthClient> {
    getClient(token: string): GithubCredentialHealthClient {
        return getOctokitClient<GithubCredentialHealthClient>(token);
    }
}

export class OctokitTrustedCredentialHealthClientAdapter implements GithubClientPort<GithubTrustedCredentialHealthClient> {
    getClient(token: string): GithubTrustedCredentialHealthClient {
        return getOctokitClient<GithubTrustedCredentialHealthClient>(token);
    }
}
