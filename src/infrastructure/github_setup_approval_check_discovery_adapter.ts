import * as github from '@actions/github';
import type { SetupApprovalCheckDiscoveryPort } from '../application/ports/setup_approval_check_discovery_port';
import type { SetupApprovalCheckCandidate, SetupDiscoveryResult } from '../domain/setup_questionnaire';

interface CheckRun { id: number; name: string; app?: { id?: number; name?: string } | null; head_sha: string; conclusion: string | null }
interface WorkflowRun { id: number; name: string; event: string; head_sha: string; run_attempt: number; status: string; conclusion: string | null; created_at?: string }
interface WorkflowJob { name: string; check_run_url?: string | null }
interface ActiveBranchRule { type?: string; ruleset_id?: number; ruleset_source_type?: string; ruleset_source?: string;
  parameters?: { required_status_checks?: { context?: string; integration_id?: number | null }[] } }

const discoveryLookbackMs = 90 * 24 * 60 * 60 * 1000;
const discoveryPageLimit = 10;

/** Bounded, read-only GitHub evidence. Unavailable permissions yield no suggestions, never invented identities. */
export class GithubSetupApprovalCheckDiscoveryAdapter implements SetupApprovalCheckDiscoveryPort {
  async discover(owner: string, repository: string, token: string, targetBranch?: string): Promise<SetupDiscoveryResult<SetupApprovalCheckCandidate>> {
    const octokit = github.getOctokit(token);
    // Active rules need only Metadata: read. Only repository-owned rulesets
    // get an exact, safe detail link; inherited rules remain unverified here.
    let required = new Map<string, string>();
    if (targetBranch && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/u.test(targetBranch)) {
      try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/rules/branches/{branch}', {
          owner, repo: repository, branch: targetBranch, per_page: 100,
        });
        for (const rule of response.data as ActiveBranchRule[]) {
          if (rule.type !== 'required_status_checks' || rule.ruleset_source_type !== 'Repository'
            || rule.ruleset_source?.toLowerCase() !== `${owner}/${repository}`.toLowerCase()
            || !Number.isSafeInteger(rule.ruleset_id) || rule.ruleset_id! <= 0) continue;
          for (const check of rule.parameters?.required_status_checks ?? []) {
            if (safeProducerName(check.context ?? '') && Number.isSafeInteger(check.integration_id) && check.integration_id! > 0) {
              required.set(`${check.context}\u0000${check.integration_id}`,
                `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/rules/${rule.ruleset_id}`);
            }
          }
        }
      } catch { required = new Map(); }
    }
    const observedAt = Date.now();
    const earliestRun = observedAt - discoveryLookbackMs;
    const recent: WorkflowRun[] = [];
    let sawRuns = false;
    let inventoryTruncated = false;
    try {
      // GitHub's filtered search can return historical samples on busy repositories.
      // Scan bounded latest-run pages so non-PR events cannot fill the entire sample.
      for (let page = 1; page <= discoveryPageLimit; page += 1) {
        const response = await octokit.rest.actions.listWorkflowRunsForRepo({ owner, repo: repository, per_page: 100, page });
        if (!Array.isArray(response.data.workflow_runs)) throw new Error('Workflow run inventory is unavailable.');
        const returned = response.data.workflow_runs as WorkflowRun[];
        const pageRuns = returned.slice(0, 100);
        sawRuns ||= pageRuns.length > 0;
        inventoryTruncated ||= returned.length > 100;
        for (const run of pageRuns) {
          const createdAt = Date.parse(run.created_at ?? '');
          if (run.event === 'pull_request' && createdAt >= earliestRun && createdAt <= observedAt) recent.push(run);
        }
        if (recent.length >= 20 || pageRuns.length < 100
          || pageRuns.every(run => Date.parse(run.created_at ?? '') < earliestRun)) break;
        if (page === discoveryPageLimit) inventoryTruncated = true;
      }
    } catch (error) {
      return { status: discoveryFailure(error), candidates: [] };
    }
    if (!sawRuns) return { status: 'no-recent-runs', candidates: [] };
    const candidates = new Map<string, SetupApprovalCheckCandidate>();
    const checksByHead = new Map<string, CheckRun[]>();
    const runs = recent
      .sort((a, b) => Date.parse(b.created_at!) - Date.parse(a.created_at!))
      .slice(0, 20);
    try {
    for (const run of runs.slice(0, 15)) {
      const headSha = run.head_sha;
      if (!/^[a-f0-9]{40}$/iu.test(headSha)) continue;
      if (!run.name || run.name.startsWith('Copilot -') || run.status !== 'completed') continue;
      let checks = checksByHead.get(headSha);
      if (!checks) {
        const response = await octokit.rest.checks.listForRef({ owner, repo: repository, ref: headSha, filter: 'all', per_page: 100 });
        checks = response.data.check_runs as CheckRun[];
        checksByHead.set(headSha, checks);
      }
      const jobs = await octokit.rest.actions.listJobsForWorkflowRunAttempt({
        owner, repo: repository, run_id: run.id, attempt_number: run.run_attempt, per_page: 100,
      });
      for (const job of jobs.data.jobs as WorkflowJob[]) {
        const id = Number(job.check_run_url?.match(/\/check-runs\/(\d+)$/u)?.[1]);
        const check = checks.find(item => item.id === id && item.head_sha === run.head_sha);
        if (!check?.app?.id || !Number.isSafeInteger(check.app.id)
          || !safeProducerName(check.name) || !safeProducerName(run.name)
          || check.name === 'Copilot / Approval') continue;
        const identity = `${check.name}\u0000${check.app.id}\u0000${run.name}`;
        if (!candidates.has(identity)) candidates.set(identity, {
          name: check.name, sourceAppId: check.app.id, workflowName: run.name,
          ...(check.app.name && safeProducerName(check.app.name) ? { sourceAppName: check.app.name } : {}),
          runUrl: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/runs/${run.id}`,
          headSha, conclusion: check.conclusion ?? 'unknown',
          ...(run.created_at && Number.isFinite(Date.parse(run.created_at)) ? { observedAt: run.created_at } : {}),
          ...(required.has(`${check.name}\u0000${check.app.id}`) ? { requiredByRuleset: {
            branch: targetBranch!, sourceUrl: required.get(`${check.name}\u0000${check.app.id}`)!,
          } } : {}),
        });
        if (candidates.size >= 30) return { status: 'observed', candidates: [...candidates.values()], truncated: true };
      }
    }
    } catch (error) {
      return { status: discoveryFailure(error), candidates: [] };
    }
    return { status: candidates.size > 0 ? 'observed' : 'no-verifiable-checks', candidates: [...candidates.values()],
      ...(inventoryTruncated || recent.length > 15 ? { truncated: true } : {}) };
  }
}

function discoveryFailure(error: unknown): 'permission-denied' | 'unavailable' {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : undefined;
  return status === 401 || status === 403 ? 'permission-denied' : 'unavailable';
}

function safeProducerName(value: string): boolean {
  return typeof value === 'string' && value.trim() === value && /^[^\p{Cc}\p{Cf}${}<>|;]{1,100}$/u.test(value);
}
