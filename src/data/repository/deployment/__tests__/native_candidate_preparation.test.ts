import { requireNativeCandidatePreparation } from '../native_candidate_preparation';
import type { DeploymentCandidateLauncher, DeploymentCandidateInspectionCommand, DeploymentCandidatePreparationScope } from '../../../../application/ports/deployment_candidate_inspection_ports';
import { buildInitialDeploymentOperation } from '../../../../application/policies/deployment_plan_policy';
import { DEFAULT_DEPLOYMENT_CONFIGURATION } from '../../../../domain/deployment_configuration';

const reviewed = 'a'.repeat(40); const candidate = 'b'.repeat(40);
function harness(compiled = false) {
  const scope: DeploymentCandidatePreparationScope = { repositoryFullName: 'owner/project', eventName: 'workflow_dispatch', eventMode: 'replace', job: 'promote', runId: 50, runAttempt: 2, headSha: reviewed };
  const command: { -readonly [K in keyof DeploymentCandidateInspectionCommand]: DeploymentCandidateInspectionCommand[K] } = { issue: 170, sourceBranch: 'release/1.5.2', sourceSha: 'c'.repeat(40), reviewedSourceSha: reviewed, productionBranch: 'master', promotionPullRequest: 173, version: '1.5.2', preparation: { kind: 'fresh', candidateSha: candidate } };
  const launcher: { -readonly [K in keyof DeploymentCandidateLauncher]: DeploymentCandidateLauncher[K] } = { issue: 170, open: true, kind: 'release', sourceBranch: command.sourceBranch,
    admission: { body: '', labels: [] }, operation: buildInitialDeploymentOperation({ operationId: 'operation-previous', locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
      kind: 'release', version: command.version, title: 'Release', changelog: 'Changes', sourceBranch: command.sourceBranch, sourceSha: command.sourceSha,
      originBranch: 'develop', originSha: 'd'.repeat(40), productionBranch: 'master', developmentBranch: 'develop', configuration: DEFAULT_DEPLOYMENT_CONFIGURATION, publicationWorkflow: 'release.yml' }) };
  const job = (id: number, name: string, steps: string[]) => ({ id, name, run_id: 50, head_sha: reviewed, status: 'completed', conclusion: 'success', steps: steps.map(name => ({ name, status: 'completed', conclusion: 'success' })) });
  const required = ['Verify reviewed replacement source', 'Complete fresh replacement verification', 'Confirm prepared replacement identity'];
  const jobs = [job(1, 'Inspect unpublished candidate replacement', ['Read native candidate authority']), job(2, compiled ? 'Build and validate prepared release' : 'Prepare and validate release', required)];
  if (compiled) jobs.push(job(3, 'Prepare files for release', [required[0], required[2]]));
  const run: any = { id: 50, run_attempt: 2, event: 'workflow_dispatch', status: 'in_progress', head_sha: reviewed, head_branch: command.sourceBranch, path: '.github/workflows/release.yml', repository: { full_name: 'owner/project' }, head_repository: { full_name: 'owner/project' } };
  const request = jest.fn(async (route: string, _parameters: Record<string, unknown>): Promise<{ data: any }> => ({ data: route.endsWith('/jobs') ? { total_count: jobs.length, jobs } : run }));
  const invoke = (currentScope: DeploymentCandidatePreparationScope | undefined = scope) => requireNativeCandidatePreparation({ request, graphql: jest.fn() }, { owner: 'owner', repo: 'project' }, command, launcher, candidate, currentScope);
  return { scope, command, launcher, run, jobs, request, invoke };
}
it.each([false, true])('requires same-attempt successful native producer and all proof steps (compiled %s)', async compiled => {
  const value = harness(compiled); await expect(value.invoke()).resolves.toBeUndefined();
  expect(value.request).toHaveBeenLastCalledWith('GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs', { owner: 'owner', repo: 'project', run_id: 50, attempt_number: 2, per_page: 100, page: 1 });
});
it('allows exact recorded recovery with skipped preparation, but still requires native preflight', async () => {
  const value = harness(); value.command.preparation = { kind: 'recorded', candidateSha: candidate }; value.jobs[1].conclusion = 'skipped';
  await expect(value.invoke()).resolves.toBeUndefined(); value.jobs[0].conclusion = 'failure'; await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
});
it.each([
  ['repositoryFullName', 'foreign/project'], ['eventName', 'push'], ['eventMode', 'prepare'], ['job', 'publish'],
  ['runId', 0], ['runId', 1.5], ['runAttempt', 0], ['runAttempt', Number.NaN], ['headSha', candidate],
])('rejects platform scope mismatch %s=%s before native reads', async (key, val) => {
  const value = harness(); await expect(value.invoke({ ...value.scope, [key as string]: val })).rejects.toMatchObject({ code: 'workflow.stale' }); expect(value.request).not.toHaveBeenCalled();
});
it('requires captured native scope and exact prepared SHA', async () => {
  const value = harness(); await expect(requireNativeCandidatePreparation({ request: value.request, graphql: jest.fn() }, { owner: 'owner', repo: 'project' }, value.command, value.launcher, candidate, undefined)).rejects.toMatchObject({ code: 'workflow.stale' });
  value.command.preparation = undefined; await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
  value.command.preparation = { kind: 'fresh', candidateSha: reviewed }; await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
});
it.each([
  ['id', 51], ['run_attempt', 1], ['event', 'push'], ['status', 'completed'], ['head_sha', candidate], ['head_branch', 'develop'], ['path', 1], ['path', '.github/workflows/other.yml'],
  ['repository', { full_name: 'foreign/project' }], ['head_repository', { full_name: 'foreign/project' }], ['repository', null],
])('rejects native run mismatch %s', async (key, val) => {
  const value = harness(); value.run[key as string] = val; await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
});
it('accepts canonical stored workflow path and GitHub reference suffix', async () => {
  const value = harness(); value.launcher.operation = { ...value.launcher.operation, publicationWorkflow: '.github/workflows/release.yml' }; value.run.path += '@refs/heads/release/1.5.2'; await value.invoke();
});
it.each(['status', 'conclusion', 'steps', 'missing', 'duplicate', 'step-status', 'step-conclusion', 'step-missing', 'step-duplicate', 'step-invalid'])('rejects unsuccessful/ambiguous producer %s', async mutation => {
  const value = harness(); const job = value.jobs[1];
  if (mutation === 'status') job.status = 'in_progress';
  if (mutation === 'conclusion') job.conclusion = 'failure';
  if (mutation === 'steps') (job as any).steps = undefined;
  if (mutation === 'missing') value.jobs.pop();
  if (mutation === 'duplicate') value.jobs.push({ ...job, id: 9 });
  if (mutation === 'step-status') job.steps[1].status = 'in_progress';
  if (mutation === 'step-conclusion') job.steps[1].conclusion = 'skipped';
  if (mutation === 'step-missing') job.steps.splice(1, 1);
  if (mutation === 'step-duplicate') job.steps.push(job.steps[1]);
  if (mutation === 'step-invalid') (job.steps as unknown[]).push([]);
  await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
});
it('requires successful unique preflight and preceding version job for compiled projects', async () => {
  const value = harness(true); value.jobs[0].name = 'unknown'; await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
  value.jobs[0].name = 'Inspect unpublished candidate replacement'; value.jobs.pop(); await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
});
it.each(['id', 'run_id', 'head_sha', 'name', 'duplicate'])('rejects malformed/foreign native job %s', async field => {
  const value = harness();
  if (field === 'duplicate') value.jobs.push({ ...value.jobs[0] }); else (value.jobs[0] as any)[field] = field === 'id' ? -1 : undefined;
  await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
});
it.each([null, [], { total_count: -1, jobs: [] }, { total_count: 0, jobs: null }, { total_count: 100, jobs: [] }, { total_count: 0, jobs: [null] }, { total_count: 0, jobs: new Array(101).fill({}) }])('rejects incomplete jobs inventory %j', async response => {
  const value = harness(); value.request.mockImplementation(async route => ({ data: route.endsWith('/jobs') ? response : value.run }));
  await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
});
it('does not turn a native read error into producer evidence', async () => {
  const value = harness(); value.request.mockRejectedValue(new Error('native read failed')); await expect(value.invoke()).rejects.toThrow('native read failed');
});
it.each(['complete', 'changed-total', 'too-many', 'unbounded'])('bounds, exhausts and deduplicates native pagination: %s', async mode => {
  const value = harness(); const proofJobs = [...value.jobs];
  value.request.mockImplementation(async (route, params) => {
    if (!route.endsWith('/jobs')) return { data: value.run };
    const page = Number(params.page); const jobs: any[] = page === 1 ? proofJobs : [];
    if (page === 1 || mode === 'unbounded') while (jobs.length < 100) jobs.push({ id: page * 100 + jobs.length, run_id: 50, head_sha: reviewed, name: `unrelated-${jobs.length}` });
    const total = mode === 'changed-total' && page === 2 ? 102 : mode === 'too-many' ? 99 : mode === 'unbounded' ? 1001 : 101;
    if (page === 2 && mode === 'complete') jobs.push({ id: 999, run_id: 50, head_sha: reviewed, name: 'unrelated-final' });
    return { data: { total_count: total, jobs } };
  });
  if (mode === 'complete') await expect(value.invoke()).resolves.toBeUndefined(); else await expect(value.invoke()).rejects.toMatchObject({ code: 'workflow.stale' });
});

it('supports redispatch on the exact recorded candidate without treating it as fresh evidence', async () => {
  const value = harness(); value.command.preparation = { kind: 'recorded', candidateSha: candidate };
  value.scope = { ...value.scope, headSha: candidate }; value.run.head_sha = candidate;
  for (const job of value.jobs) job.head_sha = candidate;
  await expect(value.invoke({ ...value.scope, headSha: candidate })).resolves.toBeUndefined();
});
