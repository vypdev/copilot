import type { GithubRuntimeDoctorPorts } from '../../application/ports/github_runtime_doctor_ports';
import { RuntimeDoctorRepository } from '../../data/repository/github/runtime_doctor_repository';
import type { BugbotScmBinding } from './bugbot_scm_port_factory';
import type { CopilotStatusReadPorts } from '../../application/usecases/read_copilot_status_workflow';

export function createGithubRuntimeDoctorPorts(binding: BugbotScmBinding, pullRequests: CopilotStatusReadPorts): GithubRuntimeDoctorPorts {
    const repository = new RuntimeDoctorRepository(binding.owner, binding.repository, binding.token);
    return Object.freeze({ serverOrigin: process.env.GITHUB_SERVER_URL ?? 'https://github.com',
        readRepository: (id: number) => repository.readRepository(id),
        readIssue: (number: number) => repository.readIssue(number),
        readLinkedBranch: (number: number) => repository.readLinkedBranch(number),
        readApprovalPolicy: () => repository.readApprovalPolicy(),
        pullRequests: Object.freeze({ getPullRequest: (number: number) => pullRequests.getPullRequest(number),
            getPullRequestHeadSha: (number: number) => pullRequests.getPullRequestHeadSha(number) }),
    });
}
