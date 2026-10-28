import * as github from '@actions/github';
import type { BoundDeploymentCandidateInspectionPort, BoundDeploymentCandidatePreflightPorts } from '../../application/ports/deployment_candidate_inspection_ports';
import { GithubCandidateReplacementRepository } from '../../data/repository/deployment/github_candidate_replacement_repository';
import { OctokitDeploymentClientAdapter } from '../github/octokit_deployment_adapter';

/** Only composed by the serialized GitHub workflow surface. */
export function createDeploymentCandidateInspection(binding: {
  readonly owner: string;
  readonly repository: string;
  readonly token: string;
}): BoundDeploymentCandidateInspectionPort {
  const repository = new GithubCandidateReplacementRepository(new OctokitDeploymentClientAdapter(), Object.freeze({
    repositoryFullName: `${github.context.repo.owner}/${github.context.repo.repo}`,
    eventName: github.context.eventName, eventMode: String(github.context.payload.inputs?.mode ?? ''),
    job: process.env.GITHUB_JOB ?? '', runId: github.context.runId,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), headSha: github.context.sha,
  }));
  return Object.freeze<BoundDeploymentCandidateInspectionPort>({ inspect: command => repository.inspect({
    ...command, owner: binding.owner, repository: binding.repository, token: binding.token,
  }) });
}


/** This object has no state-save, PR-write, publication or agent capability. */
export function createDeploymentCandidatePreflightPorts(binding: {
  readonly owner: string;
  readonly repository: string;
  readonly token: string;
}): BoundDeploymentCandidatePreflightPorts {
  const repository = new GithubCandidateReplacementRepository(new OctokitDeploymentClientAdapter());
  return Object.freeze<BoundDeploymentCandidatePreflightPorts>({
    inspect: command => repository.inspect({ ...command, owner: binding.owner, repository: binding.repository, token: binding.token }),
    readLauncher: issue => repository.readLauncher({ ...binding, issue }),
    readWorkflowRun: runId => repository.readWorkflowRun({ ...binding, runId }),
  });
}
