import { ApplicationError } from '../../../application/errors/application_error';
import type { DeploymentCandidateInspectionCommand, DeploymentCandidateLauncher, DeploymentCandidatePreparationScope } from '../../../application/ports/deployment_candidate_inspection_ports';
import type { GithubCandidateReplacementProviderClient } from '../../../infrastructure/github/ports/github_candidate_replacement_provider_port';

type Native = Record<string, unknown>;

/** Authorizes only the serialized promotion job after native prerequisites for this attempt. */
export async function requireNativeCandidatePreparation(
  client: GithubCandidateReplacementProviderClient, parameters: { readonly owner: string; readonly repo: string },
  command: DeploymentCandidateInspectionCommand, launcher: DeploymentCandidateLauncher, sourceSha: string,
  scope: DeploymentCandidatePreparationScope | undefined,
): Promise<void> {
  if (!scope || scope.repositoryFullName.toLowerCase() !== `${parameters.owner}/${parameters.repo}`.toLowerCase()
    || scope.eventName !== 'workflow_dispatch' || scope.eventMode !== 'replace' || scope.job !== 'promote'
    || !Number.isSafeInteger(scope.runId) || scope.runId < 1 || !Number.isSafeInteger(scope.runAttempt) || scope.runAttempt < 1
    || command.preparation?.candidateSha !== sourceSha
    || (scope.headSha !== command.reviewedSourceSha && (command.preparation.kind !== 'recorded' || scope.headSha !== sourceSha))) return invalid();
  const run = native((await client.request<unknown>('GET /repos/{owner}/{repo}/actions/runs/{run_id}',
    { ...parameters, run_id: scope.runId })).data);
  const workflow = launcher.operation.publicationWorkflow;
  const expectedPath = workflow.startsWith('.github/workflows/') ? workflow : `.github/workflows/${workflow}`;
  if (run.id !== scope.runId || run.run_attempt !== scope.runAttempt || run.event !== 'workflow_dispatch'
    || run.status !== 'in_progress' || run.head_sha !== scope.headSha || run.head_branch !== launcher.sourceBranch
    || typeof run.path !== 'string' || run.path.split('@', 1)[0] !== expectedPath
    || native(run.repository).full_name !== scope.repositoryFullName
    || native(run.head_repository).full_name !== scope.repositoryFullName) return invalid();
  const jobs = await readJobs(client, parameters, scope);
  successful(jobs, 'Inspect unpublished candidate replacement', ['Read native candidate authority']);
  if (command.preparation.kind === 'recorded') return;
  const kind = launcher.kind;
  const prepared = `Prepare and validate ${kind}`;
  const compiled = `Build and validate prepared ${kind}`;
  const producers = jobs.filter(job => job.name === prepared || job.name === compiled);
  if (producers.length !== 1) return invalid();
  const steps = ['Verify reviewed replacement source', 'Complete fresh replacement verification', 'Confirm prepared replacement identity'];
  successful(jobs, producers[0].name as string, steps);
  if (producers[0].name === compiled) {
    successful(jobs, `Prepare files for ${kind}`, [steps[0], steps[2]]);
  }
}

async function readJobs(client: GithubCandidateReplacementProviderClient, parameters: { readonly owner: string; readonly repo: string },
  scope: DeploymentCandidatePreparationScope): Promise<Native[]> {
  const jobs: Native[] = [];
  const ids = new Set<number>();
  let total: number | undefined;
  for (let page = 1; page <= 10; page++) {
    const response = native((await client.request<unknown>(
      'GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs',
      { ...parameters, run_id: scope.runId, attempt_number: scope.runAttempt, per_page: 100, page })).data);
    if (!Number.isSafeInteger(response.total_count) || Number(response.total_count) < 0 || !Array.isArray(response.jobs)
      || response.jobs.length > 100 || (total !== undefined && total !== response.total_count)) return invalid();
    total = response.total_count as number;
    for (const value of response.jobs) {
      const job = native(value);
      if (!Number.isSafeInteger(job.id) || Number(job.id) < 1 || ids.has(job.id as number)
        || job.run_id !== scope.runId || job.head_sha !== scope.headSha || typeof job.name !== 'string') return invalid();
      ids.add(job.id as number); jobs.push(job);
    }
    if (jobs.length === total) return jobs;
    if (response.jobs.length < 100 || jobs.length > total) return invalid();
  }
  return invalid();
}

function successful(jobs: readonly Native[], name: string, requiredSteps: readonly string[]): void {
  const matching = jobs.filter(job => job.name === name);
  if (matching.length !== 1) return invalid();
  const job = matching[0];
  if (job.status !== 'completed' || job.conclusion !== 'success' || !Array.isArray(job.steps)) return invalid();
  for (const name of requiredSteps) {
    const steps = job.steps.map(native).filter(step => step.name === name);
    if (steps.length !== 1 || steps[0].status !== 'completed' || steps[0].conclusion !== 'success') return invalid();
  }
}
function native(value: unknown): Native {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Native;
}
function invalid(): never {
  throw new ApplicationError('workflow.stale', 'Native fresh candidate preparation was not confirmed for this workflow attempt. Existing deployment state was retained.');
}
