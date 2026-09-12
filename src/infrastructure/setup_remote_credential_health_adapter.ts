import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type {
  SetupCredentialCheck,
  SetupCredentialRequirement,
} from '../domain/setup';
import type { SetupRemoteCredentialHealthPort } from '../application/ports/setup_wizard_ports';
import type { GithubClientPort } from './github/ports/github_client_provider_port';
import type {
  GithubCredentialHealthClient,
  GithubCredentialHealthQueryClient,
  GithubWorkflowRun,
} from './github/ports/github_credential_health_protocol';

const WORKFLOW_ID = 'copilot_credential_health.yml';
const INPUT_BY_SECRET: Readonly<Record<string, string>> = {
  PAT: 'check_pat',
  OPENAI_API_KEY: 'check_openai',
  ANTHROPIC_API_KEY: 'check_anthropic',
  GOOGLE_API_KEY: 'check_google',
  OPENROUTER_API_KEY: 'check_openrouter',
  CURSOR_API_KEY: 'check_cursor',
  OPENCODE_API_KEY: 'check_opencode',
  CODEX_API_KEY: 'check_codex_api_key',
};
const JOB_BY_SECRET: Readonly<Record<string, string>> = {
  PAT: 'Verify PAT',
  OPENAI_API_KEY: 'Verify OPENAI_API_KEY',
  ANTHROPIC_API_KEY: 'Verify ANTHROPIC_API_KEY',
  GOOGLE_API_KEY: 'Verify GOOGLE_API_KEY',
  OPENROUTER_API_KEY: 'Verify OPENROUTER_API_KEY',
  CURSOR_API_KEY: 'Verify CURSOR_API_KEY',
  OPENCODE_API_KEY: 'Verify OPENCODE_API_KEY',
  CODEX_API_KEY: 'Verify CODEX_API_KEY',
};

export interface CredentialHealthQueryOptions {
  waitMs?: number;
  pollMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface CredentialHealthBootstrapOptions extends CredentialHealthQueryOptions {
  workflowContent?: string;
}

/** Doctor boundary: dispatches and reads an existing health workflow; it has no repository mutation client. */
export class SetupRemoteCredentialHealthQueryAdapter implements SetupRemoteCredentialHealthPort {
  private readonly options: Required<CredentialHealthQueryOptions>;

  constructor(
    private readonly githubClient: GithubClientPort<GithubCredentialHealthQueryClient>,
    options: CredentialHealthQueryOptions = {},
  ) {
    this.options = resolveOptions(options);
  }

  async validateExisting(
    owner: string,
    repository: string,
    token: string,
    ref: string,
    requirements: readonly SetupCredentialRequirement[],
  ): Promise<readonly SetupCredentialCheck[] | undefined> {
    const client = this.githubClient.getClient(token);
    try {
      await client.rest.actions.getWorkflow({ owner, repo: repository, workflow_id: WORKFLOW_ID });
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
    return executeHealthWorkflow(client, owner, repository, ref, requirements, this.options);
  }
}

/** Setup-only boundary: may install and then remove the health workflow around one validation run. */
export class SetupRemoteCredentialHealthBootstrapAdapter implements SetupRemoteCredentialHealthPort {
  private readonly options: Required<CredentialHealthQueryOptions>;
  private readonly workflowContent: string;

  constructor(
    private readonly githubClient: GithubClientPort<GithubCredentialHealthClient>,
    options: CredentialHealthBootstrapOptions = {},
  ) {
    this.options = resolveOptions(options);
    this.workflowContent = options.workflowContent ?? readHealthWorkflow();
  }

  async validateExisting(
    owner: string,
    repository: string,
    token: string,
    ref: string,
    requirements: readonly SetupCredentialRequirement[],
  ): Promise<readonly SetupCredentialCheck[] | undefined> {
    const client = this.githubClient.getClient(token);
    let temporaryWorkflow = false;
    try {
      await client.rest.actions.getWorkflow({ owner, repo: repository, workflow_id: WORKFLOW_ID });
    } catch (error) {
      if (!isNotFound(error)) throw error;
      await this.bootstrapWorkflow(client, owner, repository, ref);
      temporaryWorkflow = true;
    }
    try {
      return await executeHealthWorkflow(client, owner, repository, ref, requirements, this.options);
    } finally {
      if (temporaryWorkflow) await this.removeTemporaryWorkflow(client, owner, repository, ref);
    }
  }

  private async bootstrapWorkflow(
    client: GithubCredentialHealthClient,
    owner: string,
    repository: string,
    ref: string,
  ): Promise<void> {
    if (!this.workflowContent) throw new Error('Credential health workflow template is unavailable.');
    await client.repos.createOrUpdateFileContents({
      owner,
      repo: repository,
      path: `.github/workflows/${WORKFLOW_ID}`,
      message: 'chore: temporarily validate Copilot credentials',
      content: Buffer.from(this.workflowContent, 'utf8').toString('base64'),
      branch: ref,
    });
  }

  private async removeTemporaryWorkflow(
    client: GithubCredentialHealthClient,
    owner: string,
    repository: string,
    ref: string,
  ): Promise<void> {
    const content = await client.repos.getContent({
      owner,
      repo: repository,
      path: `.github/workflows/${WORKFLOW_ID}`,
      ref,
    });
    if (!content.data.sha) throw new Error('Could not resolve the temporary health workflow revision for cleanup.');
    await client.repos.deleteFile({
      owner,
      repo: repository,
      path: `.github/workflows/${WORKFLOW_ID}`,
      message: 'chore: remove temporary Copilot credential health workflow',
      sha: content.data.sha,
      branch: ref,
    });
  }
}

async function executeHealthWorkflow(
  client: GithubCredentialHealthQueryClient,
  owner: string,
  repository: string,
  ref: string,
  requirements: readonly SetupCredentialRequirement[],
  options: Required<CredentialHealthQueryOptions>,
): Promise<readonly SetupCredentialCheck[]> {
  const inputs: Record<string, string> = {};
  for (const requirement of requirements) {
    const input = INPUT_BY_SECRET[requirement.name];
    if (input) inputs[input] = 'true';
  }
  const startedAt = Date.now();
  await client.rest.actions.createWorkflowDispatch({
    owner,
    repo: repository,
    workflow_id: WORKFLOW_ID,
    ref,
    inputs,
  });
  const run = await findRun(client, owner, repository, startedAt, options);
  if (!run) {
    return requirements.map((requirement) => ({
      name: requirement.name,
      status: 'unverifiable',
      message: 'Credential health workflow did not produce a run before timeout.',
    }));
  }
  const jobs = await client.rest.actions.listJobsForWorkflowRun({
    owner,
    repo: repository,
    run_id: run.id,
    per_page: 100,
  });
  const jobsByName = new Map(jobs.data.jobs.map((job) => [job.name, job]));
  return requirements.map((requirement) => ({
    name: requirement.name,
    status: healthStatus(requirement, jobsByName),
    message: healthMessage(requirement, jobsByName),
  }));
}

async function findRun(
  client: GithubCredentialHealthQueryClient,
  owner: string,
  repository: string,
  startedAt: number,
  options: Required<CredentialHealthQueryOptions>,
): Promise<GithubWorkflowRun | undefined> {
  const deadline = Date.now() + options.waitMs;
  let firstAttempt = true;
  while (firstAttempt || Date.now() <= deadline) {
    firstAttempt = false;
    const response = await client.rest.actions.listWorkflowRuns({
      owner,
      repo: repository,
      workflow_id: WORKFLOW_ID,
      event: 'workflow_dispatch',
      per_page: 10,
    });
    const run = response.data.workflow_runs.find((candidate) =>
      !candidate.created_at || new Date(candidate.created_at).getTime() >= startedAt - 5_000);
    if (run) {
      while (run.status && run.status !== 'completed' && Date.now() <= deadline) {
        await options.sleep(options.pollMs);
        Object.assign(run, (await client.rest.actions.getWorkflowRun({
          owner,
          repo: repository,
          run_id: run.id,
        })).data);
      }
      return run;
    }
    await options.sleep(options.pollMs);
  }
  return undefined;
}

function healthStatus(
  requirement: SetupCredentialRequirement,
  jobs: ReadonlyMap<string, { conclusion?: string | null }>,
): SetupCredentialCheck['status'] {
  if (!INPUT_BY_SECRET[requirement.name]) return 'unverifiable';
  const job = jobs.get(JOB_BY_SECRET[requirement.name]);
  if (!job) return 'unverifiable';
  return job.conclusion === 'success' ? 'valid' : job.conclusion ? 'invalid' : 'unverifiable';
}

function healthMessage(
  requirement: SetupCredentialRequirement,
  jobs: ReadonlyMap<string, { conclusion?: string | null }>,
): string {
  if (!INPUT_BY_SECRET[requirement.name]) return 'No remote health check is implemented for this provider.';
  const job = jobs.get(JOB_BY_SECRET[requirement.name]);
  if (!job) return 'Remote credential health workflow did not report this credential separately.';
  return job.conclusion === 'success'
    ? 'Remote credential health check passed.'
    : job.conclusion
      ? `Remote credential health check failed (${job.conclusion}).`
      : 'Remote credential health check is still incomplete.';
}

function resolveOptions(options: CredentialHealthQueryOptions): Required<CredentialHealthQueryOptions> {
  return {
    waitMs: options.waitMs ?? 120_000,
    pollMs: options.pollMs ?? 2_000,
    sleep: options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
  };
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'status' in error && error.status === 404);
}

function readHealthWorkflow(): string {
  try {
    return readFileSync(path.join(__dirname, '..', '..', 'setup', 'workflows', WORKFLOW_ID), 'utf8');
  } catch {
    return '';
  }
}
