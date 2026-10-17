import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SetupCredentialCheck, SetupCredentialRequirement } from '../domain/setup';
import { SETUP_CREDENTIAL_HEALTH_BINDINGS } from '../domain/setup_credential_health';
import { SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE } from '../domain/setup_workflow_catalog';
import { isSafeBranchTree } from '../domain/deployment_configuration';
import type { SetupTrustedCredentialHealthPort } from '../application/ports/setup_wizard_ports';
import type { GithubClientPort } from './github/ports/github_client_provider_port';
import type { GithubTrustedCredentialHealthClient } from './github/ports/github_trusted_credential_health_protocol';

const WORKFLOW_PATH = `.github/workflows/${SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE}`;
const MAX_PAGES = 10;
const MAX_EVIDENCE_AGE_MS = 300_000;
type RecordValue = Record<string, unknown>;
type Secrets = ReadonlyMap<string, { readonly scope: 'repository' | 'organization'; readonly updatedAt: number }>;

/** Observes existing, fresh, exact-template health evidence. It cannot launch repository code. */
export class SetupTrustedCredentialHealthAdapter implements SetupTrustedCredentialHealthPort {
  private readonly expectedHash?: string;
  private readonly now: () => number;

  constructor(private readonly github: GithubClientPort<GithubTrustedCredentialHealthClient>,
    options: { readonly workflowContent?: string; readonly now?: () => number } = {}) {
    const content = options.workflowContent ?? packagedWorkflow();
    this.expectedHash = content ? hash(content) : undefined;
    this.now = options.now ?? Date.now;
  }

  async validateTrustedDefault(owner: string, repository: string, operatorToken: string,
    requirements: readonly SetupCredentialRequirement[]): Promise<readonly SetupCredentialCheck[] | undefined> {
    if (!this.expectedHash || requirements.length === 0) return undefined;
    const client = boundedClient(this.github.getClient(operatorToken), Date.now() + 30_000);
    const target = { owner, repo: repository, request: { timeout: 15_000 } };
    try {
      const metadata = data(await client.rest.repos.get(target));
      const branch = metadata?.default_branch;
      if (!metadata || typeof branch !== 'string' || !isSafeBranchTree(branch) || !positive(metadata.id)) return undefined;
      const reference = data(await client.rest.git.getRef({ ...target, ref: `heads/${branch}` }));
      const sha = object(reference?.object)?.sha;
      if (!validSha(sha)) return undefined;
      const file = data(await client.rest.repos.getContent({ ...target, path: WORKFLOW_PATH, ref: sha }));
      if (file?.path !== WORKFLOW_PATH || file.encoding !== 'base64' || typeof file.content !== 'string'
        || hash(Buffer.from(file.content, 'base64').toString('utf8')) !== this.expectedHash) return undefined;
      const workflow = data(await client.rest.actions.getWorkflow({ ...target, workflow_id: SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE }));
      if (!workflow || !positive(workflow.id) || workflow.path !== WORKFLOW_PATH || workflow.state !== 'active') return undefined;
      const response = data(await client.rest.actions.listWorkflowRuns({ ...target, workflow_id: workflow.id,
        branch, event: 'workflow_dispatch', status: 'completed', per_page: 10 }));
      if (!Array.isArray(response?.workflow_runs)) return undefined;
      const now = this.now();
      const run = response.workflow_runs.map(object).find(candidate => candidate
        && matchesRun(candidate, metadata.id, workflow.id, branch, sha)
        && date(candidate.run_started_at) !== undefined && date(candidate.updated_at) !== undefined
        && now - date(candidate.updated_at)! >= 0 && now - date(candidate.updated_at)! <= MAX_EVIDENCE_AGE_MS);
      if (!run) return undefined;
      const before = await secretMetadata(client, target);
      if (!before) return undefined;
      const jobs = data(await client.rest.actions.listJobsForWorkflowRun({ ...target, run_id: run.id, filter: 'latest', per_page: 100 }));
      if (!Array.isArray(jobs?.jobs) || jobs.jobs.length > 100 || jobs.total_count !== jobs.jobs.length) return undefined;
      const latest = data(await client.rest.actions.getWorkflowRun({ ...target, run_id: run.id }));
      const finalReference = data(await client.rest.git.getRef({ ...target, ref: `heads/${branch}` }));
      const finalMetadata = data(await client.rest.repos.get(target));
      if (!latest || !matchesRun(latest, metadata.id, workflow.id, branch, sha)
        || latest.run_attempt !== run.run_attempt || object(finalReference?.object)?.sha !== sha
        || finalMetadata?.id !== metadata.id || finalMetadata.default_branch !== branch) return undefined;
      const after = await secretMetadata(client, target);
      if (!after) return undefined;
      const url = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/runs/${run.id}`;
      return requirements.map(requirement => evidence(requirement, before, after, run, jobs.jobs as unknown[], url, this.now()));
    } catch { return undefined; }
  }
}

async function secretMetadata(client: GithubTrustedCredentialHealthClient, target: RecordValue): Promise<Secrets | undefined> {
  const repository = await secretCollection(parameters => client.rest.actions.listRepoSecrets(parameters), target);
  if (!repository) return undefined;
  const organization = await secretCollection(parameters => client.rest.actions.listRepoOrganizationSecrets(parameters), target);
  if (!organization) return undefined;
  const result = new Map<string, { readonly scope: 'repository' | 'organization'; readonly updatedAt: number }>();
  for (const [name, updatedAt] of organization) result.set(name, { scope: 'organization', updatedAt });
  for (const [name, updatedAt] of repository) result.set(name, { scope: 'repository', updatedAt });
  return result;
}

async function secretCollection(read: (parameters: RecordValue) => Promise<unknown>, target: RecordValue): Promise<ReadonlyMap<string, number> | undefined> {
  const result = new Map<string, number>();
  let expectedTotal: number | undefined;
  // Stable bounded totals and full intermediate pages imply at most MAX_PAGES reads.
  for (let page = 1; ; page += 1) {
    const collection = data(await read({ ...target, page, per_page: 100 }));
    const total = collection?.total_count;
    if (!collection || !Number.isSafeInteger(total) || Number(total) < 0 || Number(total) > MAX_PAGES * 100
      || !Array.isArray(collection.secrets) || collection.secrets.length > 100
      || (expectedTotal !== undefined && expectedTotal !== total)) return undefined;
    expectedTotal = Number(total);
    for (const item of collection.secrets) {
      const secret = object(item);
      if (!secret || typeof secret.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/u.test(secret.name)
        || date(secret.updated_at) === undefined || result.has(secret.name.toUpperCase())) return undefined;
      result.set(secret.name.toUpperCase(), date(secret.updated_at)!);
    }
    if (result.size === expectedTotal) return result;
    if (result.size > expectedTotal || collection.secrets.length < 100) return undefined;
  }
}

function evidence(requirement: SetupCredentialRequirement, before: Secrets, after: Secrets,
  run: RecordValue, jobs: readonly unknown[], url: string, now: number): SetupCredentialCheck {
  const pending = (): SetupCredentialCheck => ({ name: requirement.name, status: 'unverifiable',
    message: 'Fresh trusted health evidence is unavailable for this binding.', verificationRunUrl: url });
  const previous = before.get(requirement.name);
  const current = after.get(requirement.name);
  if (!current) return { name: requirement.name, status: 'missing', message: 'The existing Secret binding is no longer available.', verificationRunUrl: url };
  const binding = SETUP_CREDENTIAL_HEALTH_BINDINGS[requirement.name];
  const started = date(run.run_started_at)!;
  if (!binding || !previous || previous.scope !== current.scope || previous.updatedAt !== current.updatedAt
    || current.updatedAt > started) return pending();
  const matches = jobs.map(object).filter(job => job?.name === binding.job);
  if (matches.length !== 1) return pending();
  const job = matches[0]!;
  const completed = date(job.completed_at);
  if (job.status !== 'completed' || job.run_id !== run.id || job.head_sha !== run.head_sha
    || completed === undefined || completed < started || completed > now || now - completed > MAX_EVIDENCE_AGE_MS) return pending();
  if (job.conclusion !== 'success' && job.conclusion !== 'failure') return pending();
  return { name: requirement.name, status: job.conclusion === 'success' ? 'valid' : 'invalid', verificationRunUrl: url,
    message: job.conclusion === 'success' ? 'The unchanged existing binding passed its recent trusted authentication check.'
      : 'The recent trusted credential check failed; inspect its run before reusing this binding.' };
}

function matchesRun(run: RecordValue, repositoryId: unknown, workflowId: unknown, branch: string, sha: string): boolean {
  return positive(run.id) && positive(run.run_attempt) && run.workflow_id === workflowId
    && object(run.repository)?.id === repositoryId && run.head_branch === branch && run.head_sha === sha
    && run.event === 'workflow_dispatch' && run.status === 'completed';
}

function object(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
}
function data(value: unknown): RecordValue | undefined { return object(object(value)?.data); }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function validSha(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value); }
function date(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function hash(content: string): string { return createHash('sha256').update(content.replace(/\r\n/gu, '\n')).digest('hex'); }
function packagedWorkflow(): string {
  try { return readFileSync(join(__dirname, '..', '..', 'setup', 'workflows', SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE), 'utf8'); }
  catch { return ''; }
}

/** SDK transport options alone are insufficient when a fetch boundary never settles. */
function boundedClient(client: GithubTrustedCredentialHealthClient, deadline: number): GithubTrustedCredentialHealthClient {
  const wrap = (operation: (parameters: RecordValue) => Promise<unknown>) => async (parameters: RecordValue): Promise<unknown> => {
    const remaining = Math.min(15_000, deadline - Date.now());
    if (remaining <= 0) throw new Error('Trusted evidence read deadline expired.');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Trusted evidence read timed out.')); }, remaining);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => operation({ ...parameters,
        request: { ...object(parameters.request), timeout: remaining, signal: controller.signal } })), timeout]);
    } finally { clearTimeout(timer); }
  };
  return { rest: {
    repos: { get: wrap(client.rest.repos.get), getContent: wrap(client.rest.repos.getContent) },
    git: { getRef: wrap(client.rest.git.getRef) },
    actions: { getWorkflow: wrap(client.rest.actions.getWorkflow), listWorkflowRuns: wrap(client.rest.actions.listWorkflowRuns),
      getWorkflowRun: wrap(client.rest.actions.getWorkflowRun), listJobsForWorkflowRun: wrap(client.rest.actions.listJobsForWorkflowRun),
      listRepoSecrets: wrap(client.rest.actions.listRepoSecrets), listRepoOrganizationSecrets: wrap(client.rest.actions.listRepoOrganizationSecrets) },
  } };
}
