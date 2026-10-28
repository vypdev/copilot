import { getOctokitClient } from '../github/octokit_client_resolver';
import { IssueEventAdmissionRepository } from '../../data/repository/workflow/issue_event_admission_repository';
import type { GithubIssueAdmissionClient } from '../github/ports/github_issue_admission_provider_ports';

export function createIssueEventAdmissionPort(owner: string, repository: string, token: string, evidenceToken: string): IssueEventAdmissionRepository {
    return new IssueEventAdmissionRepository(getOctokitClient<GithubIssueAdmissionClient>(token),
        getOctokitClient<GithubIssueAdmissionClient>(evidenceToken), owner, repository);
}
