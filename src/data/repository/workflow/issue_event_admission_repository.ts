import type { IssueAdmissionSnapshot, IssueEventAdmissionContext, IssueEventAdmissionPort } from '../../../application/ports/issue_event_admission_ports';
import { ApplicationError } from '../../../application/errors/application_error';
import type { GithubIssueAdmissionClient } from '../../../infrastructure/github/ports/github_issue_admission_provider_ports';

/** Repository-bound queries. No write permission or provider exception leaves this boundary. */
export class IssueEventAdmissionRepository implements IssueEventAdmissionPort {
    constructor(private readonly product: GithubIssueAdmissionClient, private readonly evidence: GithubIssueAdmissionClient,
        private readonly owner: string, private readonly repository: string) {}

    async authenticatedLogin(): Promise<string> {
        try {
            const user = record((await this.product.rest.users.getAuthenticated()).data);
            if (typeof user?.login !== 'string' || !user.login.trim()) throw new Error();
            return user.login;
        } catch { throw new ApplicationError('authorization.credential-invalid', 'Issue event admission could not verify the product account.'); }
    }

    async readIssue(issueNumber: number): Promise<IssueAdmissionSnapshot> {
        try {
            const issue = record((await this.product.rest.issues.get({ owner: this.owner, repo: this.repository, issue_number: issueNumber })).data);
            const author = record(issue?.user);
            const milestone = issue?.milestone === null ? null : record(issue?.milestone)?.id;
            const type = issue?.type === null || issue?.type === undefined ? null : record(issue.type)?.name;
            if (!issue || issue.pull_request !== undefined || issue.number !== issueNumber
                || !positive(issue.id) || typeof issue.title !== 'string' || !(issue.body === null || typeof issue.body === 'string')
                || !['open', 'closed'].includes(String(issue.state)) || typeof issue.updated_at !== 'string'
                || !timestamp(issue.updated_at) || typeof author?.login !== 'string' || !author.login.trim()
                || typeof issue.locked !== 'boolean' || !(milestone === null || positive(milestone))
                || !(type === null || typeof type === 'string')
                || issue.repository_url !== `${issueRepositoryApiPrefix(issue.repository_url)}/repos/${this.owner}/${this.repository}`) throw new Error();
            return Object.freeze({ id: issue.id as number, number: issueNumber, title: issue.title, body: issue.body ?? '',
                state: issue.state as 'open' | 'closed', updatedAt: issue.updated_at, author: author.login,
                labels: Object.freeze(strings(issue.labels, 'name')), assignees: Object.freeze(strings(issue.assignees, 'login')),
                milestone: milestone as number | null, issueType: type, locked: issue.locked });
        } catch { throw new ApplicationError('provider.contract-invalid', 'Native issue state could not be verified before admission.'); }
    }

    async hasSuccessfulReceipt(name: string, context: IssueEventAdmissionContext): Promise<boolean> {
        const binding = { owner: this.owner, repo: this.repository };
        const current = record((await this.evidence.rest.actions.getWorkflowRun({ ...binding, run_id: context.runId })).data);
        if (!current || current.id !== context.runId || current.event !== 'issues' || current.head_sha !== context.workflowRevision
            || !actorMatches(current.actor, context.actor) || current.run_attempt !== 1 || !timestamp(current.created_at) || !positive(current.workflow_id) || typeof current.path !== 'string' || !/^\.github\/workflows\/[\w.-]+\.ya?ml$/u.test(current.path)) return false;
        const response = record((await this.evidence.rest.actions.listArtifactsForRepo({ ...binding, name, per_page: 100 })).data);
        if (!Array.isArray(response?.artifacts)) return false;
        // Bounded optimization. Ambiguous, absent, failed or canceled evidence never skips work.
        for (const raw of response.artifacts.slice(0, 3)) {
            const artifact = record(raw); const source = record(artifact?.workflow_run);
            if (artifact?.name !== name || artifact.expired !== false || !positive(source?.id)
                || (source.id as number) >= context.runId || !timestamp(artifact.created_at)
                || Date.parse(artifact.created_at) <= Date.parse(current.created_at as string) || !positive(artifact.size_in_bytes) || (artifact.size_in_bytes as number) > 4096) continue;
            const run = record((await this.evidence.rest.actions.getWorkflowRun({ ...binding, run_id: source.id as number })).data);
            if (run?.id === source.id && run.workflow_id === current.workflow_id && run.path === current.path
                && run.head_sha === context.workflowRevision && run.event === 'issues' && run.status === 'completed' && run.conclusion === 'success'
                && actorMatches(run.actor, context.actor)) return true;
        }
        return false;
    }
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function strings(value: unknown, key: string): string[] {
    if (!Array.isArray(value) || value.length > 100) throw new Error();
    return value.map(item => { const field = record(item)?.[key]; if (typeof field !== 'string' || !field) throw new Error(); return field; });
}
function issueRepositoryApiPrefix(value: unknown): string {
    if (typeof value !== 'string') throw new Error();
    const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    return value.slice(0, value.indexOf('/repos/'));
}

function timestamp(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)
        && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
}
function actorMatches(value: unknown, expected: string): boolean {
    const login = record(value)?.login;
    return typeof login === 'string' && login.toLowerCase() === expected.toLowerCase();
}
