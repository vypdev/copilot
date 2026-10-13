import type { BoundIssueCompletionPort, BoundNativeStatusReadPort, BoundIssueCompletionMetadataPort } from '../../application/ports/issue_completion_ports';
import { IssueCompletionRepository } from '../../data/repository/issue/issue_completion_repository';
import type { GithubIssueCompletionClient } from '../github/ports/github_issue_completion_client';
import { getOctokitClient } from '../github/octokit_client_resolver';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';

export function bindIssueCompletion(repository: IssueCompletionRepository): BoundIssueCompletionPort {
    return Object.freeze({ readPullRequest: (number: number) => repository.readPullRequest(number), forIssue: (number: number) => {
        if (!Number.isSafeInteger(number) || number < 1) throw new Error('A safe issue number is required.');
        return Object.freeze({
            read: () => repository.readIssue(number), close: () => repository.closeIssue(number),
            addLabel: (label: string) => repository.addLabel(number, label),
            removeLabel: (label: string) => repository.removeLabel(number, label),
        });
    } });
}
export function bindNativeStatusRead(repository: IssueCompletionRepository): BoundNativeStatusReadPort {
    return Object.freeze({ readIssue: (number: number) => repository.readIssue(number),
        readPullRequest: (number: number) => repository.readPullRequest(number) });
}
export function bindIssueCompletionMetadata(repository: IssueCompletionRepository): BoundIssueCompletionMetadataPort {
    return Object.freeze({ forIssue: (number: number) => {
        if (!Number.isSafeInteger(number) || number < 1) throw new Error('A safe issue number is required.');
        return Object.freeze({ read: () => repository.readIssue(number),
            addLabel: (label: string) => repository.addLabel(number, label),
            removeLabel: (label: string) => repository.removeLabel(number, label) });
    } });
}
export function createIssueCompletionRepository(binding: RepositoryCredentialBinding): IssueCompletionRepository {
    return new IssueCompletionRepository({ getClient: token => getOctokitClient<GithubIssueCompletionClient>(token) },
        Object.freeze({ ...binding, apiBaseUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com' }));
}
export function createNativeStatusReadPort(binding: RepositoryCredentialBinding): BoundNativeStatusReadPort {
    return bindNativeStatusRead(createIssueCompletionRepository(binding));
}
