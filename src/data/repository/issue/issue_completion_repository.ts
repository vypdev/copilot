import type { NativeIssueCompletionFacts } from '../../../domain/issue_completion';
import { ISSUE_COMPLETION_LABEL_LIMIT, isIssueCompletionLabelName } from '../../../domain/issue_completion';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueCompletionClient } from '../../../infrastructure/github/ports/github_issue_completion_client';
import { ApplicationError, toApplicationError } from '../../../application/errors/application_error';
import { readConfigurationBlock } from '../../../manager/description/configuration_markers';
import { projectDeploymentIssueCompletion } from '../../../domain/deployment_issue_completion';
import { CONFIG_SCHEMA_VERSION } from '../../model/config';

interface Binding { readonly owner: string; readonly repository: string; readonly token: string; readonly apiBaseUrl: string }
export interface NativePullRequestState { readonly number: number; readonly state: 'open' | 'closed'; readonly merged: boolean }

/** Exact repository/subject reads and selective writes. Never replaces a label inventory. */
export class IssueCompletionRepository {
    constructor(private readonly client: GithubClientPort<GithubIssueCompletionClient>, private readonly binding: Binding) {}

    private parameters(number: number): Record<string, unknown> {
        if (!Number.isSafeInteger(number) || number < 1) throw invalid();
        return { owner: this.binding.owner, repo: this.binding.repository, issue_number: number, request: { redirect: 'error' } };
    }
    private apiPath(path: string): string {
        const base = new URL(this.binding.apiBaseUrl);
        if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw invalid();
        return `${base.href.replace(/\/$/u, '')}/repos/${encodeURIComponent(this.binding.owner)}/${encodeURIComponent(this.binding.repository)}${path}`;
    }
    private exactUrl(value: unknown, path: string): boolean {
        return typeof value === 'string' && value.toLowerCase() === this.apiPath(path).toLowerCase();
    }
    async readIssue(number: number): Promise<NativeIssueCompletionFacts> {
        try {
            const response = await this.client.getClient(this.binding.token).rest.issues.get(this.parameters(number));
            const data = object(response.data);
            if (!this.exactUrl(response.url, `/issues/${number}`) || data.number !== number || 'pull_request' in data
                || !this.exactUrl(data.repository_url, '') || !['open', 'closed'].includes(data.state as string)
                || !(data.state_reason === null || ['completed', 'not_planned', 'duplicate', 'reopened'].includes(data.state_reason as string))
                || !Array.isArray(data.labels) || data.labels.length > ISSUE_COMPLETION_LABEL_LIMIT) throw invalid();
            const labels = data.labels.map(value => typeof value === 'string' ? value : object(value).name);
            if (labels.some(value => !isIssueCompletionLabelName(value))
                || new Set(labels.map(value => (value as string).toLowerCase())).size !== labels.length) throw invalid();
            const deploymentCompletion = readDeploymentCompletion(data.body);
            return Object.freeze({ number, state: data.state as 'open' | 'closed',
                reason: data.state_reason === null ? 'unknown' : data.state_reason as NativeIssueCompletionFacts['reason'],
                labels: Object.freeze(labels as string[]), ...(deploymentCompletion ? { deploymentCompletion } : {}) });
        } catch (error) { throw toApplicationError(error, 'provider.unavailable', 'Current native issue completion facts could not be verified.'); }
    }
    async readPullRequest(number: number): Promise<NativePullRequestState> {
        try {
            const parameters = this.parameters(number);
            delete parameters.issue_number;
            const response = await this.client.getClient(this.binding.token).rest.pulls.get({ ...parameters, pull_number: number });
            const data = object(response.data);
            const repo = object(object(data.base).repo);
            if (!this.exactUrl(response.url, `/pulls/${number}`) || data.number !== number
                || !this.exactUrl(repo.url, '') || !['open', 'closed'].includes(data.state as string)
                || typeof data.merged !== 'boolean') throw invalid();
            return Object.freeze({ number, state: data.state as 'open' | 'closed', merged: data.merged });
        } catch (error) { throw toApplicationError(error, 'provider.unavailable', 'Current native pull-request state could not be verified.'); }
    }
    async closeIssue(number: number): Promise<boolean> {
        const facts = await this.readIssue(number);
        if (facts.deploymentCompletion === 'pending') throw new ApplicationError('workflow.stale', 'The native deployment has not reached its completion boundary.');
        if (facts.state === 'closed') return false;
        try {
            await this.client.getClient(this.binding.token).rest.issues.update({ ...this.parameters(number), state: 'closed', state_reason: 'completed' });
            return true;
        } catch (error) { throw toApplicationError(error, 'provider.unavailable', 'The native issue close request failed.'); }
    }
    async addLabel(number: number, label: string): Promise<void> {
        try { await this.client.getClient(this.binding.token).rest.issues.addLabels({ ...this.parameters(number), labels: [label] }); }
        catch (error) { throw toApplicationError(error, 'provider.unavailable', 'A completion label could not be added.'); }
    }
    async removeLabel(number: number, label: string): Promise<void> {
        try { await this.client.getClient(this.binding.token).rest.issues.removeLabel({ ...this.parameters(number), name: label }); }
        catch (error) { throw toApplicationError(error, 'provider.unavailable', 'A stale completion label could not be removed.'); }
    }
}
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    return value as Record<string, unknown>;
}
function invalid(): ApplicationError {
    return new ApplicationError('provider.contract-invalid', 'Native completion facts do not match the verified repository and subject.');
}

function readDeploymentCompletion(body: unknown): NativeIssueCompletionFacts['deploymentCompletion'] {
    if (body === undefined || body === null) return undefined;
    if (typeof body !== 'string') throw invalid();
    const block = readConfigurationBlock(body);
    if (block.kind === 'invalid') throw invalid();
    if (block.kind === 'absent') return undefined;
    let payload: Record<string, unknown>;
    try { payload = object(JSON.parse(block.content)); } catch { throw invalid(); }
    if (payload.deploymentOrchestration === undefined) return undefined;
    if (payload.schemaVersion !== CONFIG_SCHEMA_VERSION) throw invalid();
    try { return projectDeploymentIssueCompletion(payload.deploymentOrchestration); } catch { throw invalid(); }
}
