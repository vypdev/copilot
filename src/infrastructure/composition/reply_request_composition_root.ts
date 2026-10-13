import type { BoundReplyRequestReadPort, ReplyRequestSnapshot } from '../../application/ports/reply_request_read_ports';
import { ReplyRequestRepository } from '../../data/repository/reply_request_repository';
import type { GithubReplyRequestClient } from '../github/ports/github_reply_request_client';
import { getOctokitClient } from '../github/octokit_client_resolver';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';

export function createReplyRequestReadPort(binding: RepositoryCredentialBinding): BoundReplyRequestReadPort {
    const captured = Object.freeze({ ...binding, apiBaseUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com' });
    const repository = new ReplyRequestRepository(getOctokitClient<GithubReplyRequestClient>(captured.token), captured);
    return Object.freeze({ matches: (snapshot: ReplyRequestSnapshot) => repository.matches(snapshot) });
}
