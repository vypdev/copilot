import { readApprovalEvidence } from './approval_evidence_read';
import { approvalEvidenceError } from '../../../application/errors/approval_evidence_error';
import type { ApprovalEvidenceDiagnostic, ApprovalEvidenceOperation } from '../../../domain/approval_evidence_diagnostic';
import { ApplicationError } from '../../../application/errors/application_error';
import { readCurrentBaseRevision } from './current_base_revision_query';
import { logInfo } from '../../../application/ports/logging_ports';
import * as github from '@actions/github';
import type { TrustedApprovalPolicyRead } from '../../../domain/github_runtime_doctor';
import type {
    ApprovalBugbotFact,
    ApprovalCheckFact,
    ApprovalDecision,
    ApprovalEvidence,
    ApprovalReviewFact,
} from '../../../domain/pull_request_approval';
import type {
    ApprovalObservationTarget,
    ApprovalPostedReview,
    PullRequestApprovalPort,
} from '../../../application/ports/pull_request_approval_ports';
import { parsePullRequestApprovalPolicy } from '../../../domain/pull_request_approval_policy';
import { parseApprovalCoverageZip } from './approval_coverage_artifact';
import { fileMatchesIgnorePatterns } from '../../../application/policies/file_ignore_policy';
import { renderApprovalAssessment } from '../../../application/policies/pull_request_approval_presentation_policy';

export interface ApprovalRepositorySettings {
    readonly mainBranch: string;
    readonly developmentBranch: string;
    readonly branchPrefixes: Readonly<Record<'feature' | 'bugfix' | 'documentation' | 'chore', string>>;
    readonly bugbotSeverity: string;
    readonly bugbotDryRun: boolean;
    readonly bugbotIgnorePatterns: readonly string[];
    readonly githubToken?: string;
    readonly locale?: string;
}

interface ApprovalGithubFile { readonly filename: string }
interface ApprovalGithubReview { readonly id: number; readonly user?: { readonly id?: number } | null; readonly state: string; readonly commit_id?: string; readonly submitted_at?: string | null }
interface ApprovalGithubComment { readonly id: number; readonly user?: { readonly id?: number } | null; readonly body?: string | null }
interface ApprovalGithubCheck { readonly id: number; readonly name: string; readonly app?: { readonly id?: number } | null; readonly head_sha: string; readonly conclusion: string | null; readonly status: string; readonly check_suite?: { readonly id: number } | null }
interface ApprovalGithubRun { readonly id: number; readonly name: string; readonly head_sha: string; readonly check_suite_id?: number; readonly run_attempt: number; readonly status: string; readonly conclusion: string | null }
interface ApprovalGithubJob { readonly check_run_url?: string | null }
interface ApprovalGithubArtifact { readonly id: number; readonly name: string; readonly expired: boolean; readonly size_in_bytes: number }

/** GitHub DTOs terminate here. Every partial/forbidden read becomes non-authorizing evidence. */
export class PullRequestApprovalRepository implements PullRequestApprovalPort {
    private readonly octokit;
    private readonly checkOctokit;

    constructor(private readonly token: string, private readonly settings: ApprovalRepositorySettings) {
        this.octokit = github.getOctokit(token);
        this.checkOctokit = settings.githubToken ? github.getOctokit(settings.githubToken) : undefined;
    }

    /** Read-only source evidence; failure never consults an injected policy value. */
    async readPolicyEvidence(target: Pick<ApprovalObservationTarget, 'owner' | 'repository'>): Promise<TrustedApprovalPolicyRead> {
        try {
            const read = await this.readEffectivePolicy(target);
            return Object.freeze(read ? { status: 'available', ...read } : { status: 'absent' });
        } catch { return Object.freeze({ status: 'unavailable' }); }
    }

    async readPolicy(target: ApprovalObservationTarget): Promise<string | undefined> {
        return readApprovalEvidence('policy', async () => (await this.readEffectivePolicy(target))?.value);
    }

    private async readEffectivePolicy(target: Pick<ApprovalObservationTarget, 'owner' | 'repository'>) {
        return readEffectiveApprovalPolicy(this.octokit, target);
    }

    async loadEvidence(target: ApprovalObservationTarget): Promise<ApprovalEvidence> {
        const diagnostics: ApprovalEvidenceDiagnostic[] = [];
        const { data: pull } = await readApprovalEvidence('pull-request', async () => {
            const response = await this.octokit.rest.pulls.get({ owner: target.owner, repo: target.repository, pull_number: target.pullNumber });
            if (!response.data?.head || !response.data?.base || typeof response.data.head.sha !== 'string'
                || typeof response.data.head.ref !== 'string' || !Number.isSafeInteger(response.data.number)) {
                throw approvalEvidenceError('pull-request', 'invalid-response');
            }
            return response;
        });
        const headSha = pull.head.sha;
        const baseSha = await this.readCurrentBaseSha(target, pull.base.ref);
        const policy = await readApprovalEvidence('policy', async () => {
            const raw = await this.readPolicy(target);
            try { return parsePullRequestApprovalPolicy(raw); } catch { throw approvalEvidenceError('policy', 'invalid-response'); }
        });
        let testedMergeSha: string | undefined;
        if (pull.mergeable === true && /^[a-f0-9]{40}$/iu.test(pull.merge_commit_sha ?? '')) {
            try {
                const merge = await readApprovalEvidence('merge-commit', async () => {
                    const response = await this.octokit.rest.git.getCommit({ owner: target.owner, repo: target.repository, commit_sha: pull.merge_commit_sha! });
                    if (!Array.isArray(response.data?.parents)) throw approvalEvidenceError('merge-commit', 'invalid-response');
                    return response;
                });
                if (merge.data.parents[0]?.sha === baseSha && merge.data.parents[1]?.sha === headSha
                    && merge.data.parents.length === 2) testedMergeSha = pull.merge_commit_sha!;
            } catch (cause) { collectDiagnostic(diagnostics, cause); }
        }
        const [files, reviews, comments, headChecks, mergeChecks, headRuns, mergeRuns, rules, user] = await Promise.all([
            this.allPages<ApprovalGithubFile>('files', this.octokit.rest.pulls.listFiles, { owner: target.owner, repo: target.repository, pull_number: target.pullNumber }),
            this.allPages<ApprovalGithubReview>('reviews', this.octokit.rest.pulls.listReviews, { owner: target.owner, repo: target.repository, pull_number: target.pullNumber }),
            this.allPages<ApprovalGithubComment>('comments', this.octokit.rest.issues.listComments, { owner: target.owner, repo: target.repository, issue_number: target.pullNumber }),
            this.allPages<ApprovalGithubCheck>('head-checks', this.octokit.rest.checks.listForRef, { owner: target.owner, repo: target.repository, ref: headSha, filter: 'all' as const }),
            testedMergeSha ? this.allPages<ApprovalGithubCheck>('merge-checks', this.octokit.rest.checks.listForRef, { owner: target.owner, repo: target.repository, ref: testedMergeSha, filter: 'all' as const }) : Promise.resolve([]),
            this.allPages<ApprovalGithubRun>('head-runs', this.octokit.rest.actions.listWorkflowRunsForRepo, { owner: target.owner, repo: target.repository, head_sha: headSha }),
            testedMergeSha ? this.allPages<ApprovalGithubRun>('merge-runs', this.octokit.rest.actions.listWorkflowRunsForRepo, { owner: target.owner, repo: target.repository, head_sha: testedMergeSha }) : Promise.resolve([]),
            this.effectiveRules(target.owner, target.repository, pull.base.ref, diagnostics),
            readApprovalEvidence('authenticated-user', async () => {
                const response = await this.octokit.rest.users.getAuthenticated();
                if (!Number.isSafeInteger(response.data?.id) || response.data.id < 1) throw approvalEvidenceError('authenticated-user', 'invalid-response');
                return response;
            }),
        ]);
        const branch = Object.entries(this.settings.branchPrefixes)
            .find(([, prefix]) => pull.head.ref.startsWith(`${prefix}/`));
        const branchKind = branch?.[0] as ApprovalEvidence['branchKind'];
        const branchIssue = branch
            ? Number(pull.head.ref.slice(branch[1].length + 1).match(/^(\d+)-/u)?.[1])
            : NaN;
        const linkedIssue = Number.isSafeInteger(branchIssue) && branchIssue > 0
            && new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#${branchIssue}\\b`, 'iu').test(pull.body ?? '');
        const checkRuns = [...headChecks, ...mergeChecks];
        const workflowRuns = [...headRuns, ...mergeRuns];
        const latestRuns = [...new Set(policy.testChecks.map(producer => producer.workflowName))].flatMap(name => {
            const named = workflowRuns.filter(run => run.name === name);
            const onMerge = named.filter(run => run.head_sha === testedMergeSha);
            const authoritative = onMerge.length > 0 ? onMerge : named.filter(run => run.head_sha === headSha);
            const latest = [...authoritative].sort((left, right) => right.id - left.id || right.run_attempt - left.run_attempt)[0];
            return latest ? [latest] : [];
        });
        const currentJobs = await Promise.all(latestRuns.map(async run => ({
            run,
            jobs: await this.allPages<ApprovalGithubJob>('jobs', this.octokit.rest.actions.listJobsForWorkflowRunAttempt, {
                owner: target.owner, repo: target.repository, run_id: run.id, attempt_number: run.run_attempt,
            }),
        })));
        const checkFacts: ApprovalCheckFact[] = currentJobs.flatMap(({ run, jobs }) => jobs.flatMap(job => {
            const id = Number(job.check_run_url?.match(/\/check-runs\/(\d+)$/u)?.[1]);
            const check = checkRuns.find(item => item.id === id && item.head_sha === run.head_sha);
            if (!check) return [];
            return [{
                name: check.name,
                sourceAppId: check.app?.id ?? 0,
                workflowName: run.name,
                headSha: check.head_sha,
                conclusion: run.conclusion === 'success' ? check.conclusion : run.conclusion,
                status: run.status === 'completed' ? check.status : run.status,
                runId: run.id,
                attempt: run.run_attempt,
            }];
        }));
        const botId = user.data.id;
        const botCards = comments.filter((comment: ApprovalGithubComment) => comment.user?.id === botId && /<!-- copilot-bugbot-status schema="1"/u.test(comment.body ?? ''));
        const bugbot = botCards.length === 1 ? parseBugbotCard(botCards[0].body ?? '', headSha, target.pullNumber) : undefined;
        const reviewFacts: ApprovalReviewFact[] = reviews.map((review: ApprovalGithubReview) => ({
            id: review.id,
            userId: review.user?.id ?? 0,
            state: review.state,
            commitId: review.commit_id ?? '',
            submittedAt: review.submitted_at ?? '',
        }));
        const numericCoverage = policy.coverage.mode === 'numeric'
            ? await this.numericCoverage(target, policy.coverage.artifactWorkflowName, headSha, baseSha, testedMergeSha, workflowRuns, diagnostics)
            : undefined;
        return {
            ...(diagnostics.length ? { diagnostics: Object.freeze(diagnostics) } : {}),
            repositoryId: pull.base.repo?.id ?? 0,
            pullNumber: pull.number,
            headSha,
            baseSha,
            ...(testedMergeSha ? { testedMergeSha } : {}),
            mergeCommitVerified: testedMergeSha !== undefined,
            baseRef: pull.base.ref,
            targetRole: pull.base.ref === this.settings.developmentBranch ? 'development'
                : pull.base.ref === this.settings.mainBranch ? 'main' : undefined,
            branchKind,
            linkedIssue,
            open: pull.state === 'open',
            draft: pull.draft === true,
            sameRepository: pull.head.repo?.id === pull.base.repo?.id,
            authorId: pull.user?.id ?? 0,
            authorIsBot: pull.user?.type === 'Bot',
            botUserId: botId,
            changedPaths: files.map((file: ApprovalGithubFile) => file.filename),
            ignoredChangedPaths: files.map((file: ApprovalGithubFile) => file.filename)
                .filter((path: string) => fileMatchesIgnorePatterns(path, this.settings.bugbotIgnorePatterns)),
            filesComplete: files.length === pull.changed_files && files.length <= 3000,
            rulesReadable: rules.readable,
            dismissesStaleReviews: rules.dismissesStaleReviews,
            requiredChecks: rules.requiredChecks,
            checks: checkFacts,
            bugbot,
            bugbotSeverity: this.settings.bugbotSeverity,
            bugbotDryRun: this.settings.bugbotDryRun,
            reviews: reviewFacts,
            reviewHistoryComplete: reviews.length < 3000,
            ...(numericCoverage ? { numericCoverage } : {}),
        };
    }

    private async numericCoverage(
        target: ApprovalObservationTarget,
        workflowName: string,
        headSha: string,
        baseSha: string,
        testedMergeSha: string | undefined,
        workflowRuns: ApprovalGithubRun[],
        diagnostics: ApprovalEvidenceDiagnostic[],
    ): Promise<ApprovalEvidence['numericCoverage'] | undefined> {
        const candidates = workflowRuns.filter(run => run.name === workflowName
            && (run.head_sha === headSha || run.head_sha === testedMergeSha));
        const mergeCandidates = candidates.filter(run => run.head_sha === testedMergeSha);
        const authoritative = mergeCandidates.length > 0 ? mergeCandidates : candidates;
        const run = [...authoritative].sort((left, right) => right.id - left.id || right.run_attempt - left.run_attempt)[0];
        if (!run || run.conclusion !== 'success' || run.status !== 'completed') return undefined;
        try {
            const artifacts = await this.allPages<ApprovalGithubArtifact>('coverage-artifacts', this.octokit.rest.actions.listWorkflowRunArtifacts, {
                owner: target.owner, repo: target.repository, run_id: run.id,
            });
            const matches = artifacts.filter(artifact => artifact.name === 'copilot-diff-coverage-v1' && !artifact.expired);
            if (matches.length !== 1 || matches[0].size_in_bytes > 64 * 1024) throw approvalEvidenceError('coverage-artifacts', 'artifact-unavailable');
            const response = await readApprovalEvidence('coverage-download', async () => this.octokit.rest.actions.downloadArtifact({
                owner: target.owner, repo: target.repository, artifact_id: matches[0].id, archive_format: 'zip',
            }));
            const data = response.data;
            const bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
                : data instanceof Uint8Array ? data
                    : typeof data === 'string' ? Buffer.from(data, 'binary') : undefined;
            const attestation = bytes ? parseApprovalCoverageZip(bytes) : undefined;
            if (!attestation) throw approvalEvidenceError('coverage-parse', 'artifact-invalid');
            if (attestation.repositoryId !== target.repositoryId
                || attestation.pullNumber !== target.pullNumber || attestation.headSha !== headSha
                || attestation.baseSha !== baseSha || attestation.workflowRunId !== run.id
                || attestation.workflowRunAttempt !== run.run_attempt) throw approvalEvidenceError('coverage-parse', 'artifact-mismatch');
            return {
                coveredChangedLines: attestation.coveredChangedLines,
                totalChangedLines: attestation.totalChangedLines,
                headSha,
                baseSha,
            };
        } catch (cause) { collectDiagnostic(diagnostics, cause); return undefined; }
    }

    async submitApproval(target: ApprovalObservationTarget, headSha: string, body: string): Promise<ApprovalPostedReview> {
        const response = await this.octokit.rest.pulls.createReview({
            owner: target.owner, repo: target.repository, pull_number: target.pullNumber,
            event: 'APPROVE', commit_id: headSha, body,
        });
        return {
            id: response.data.id,
            commitId: response.data.commit_id ?? '',
            userId: response.data.user?.id ?? 0,
            state: response.data.state,
        };
    }

    async publishAssessment(target: ApprovalObservationTarget, evidence: ApprovalEvidence, decision: ApprovalDecision, reviewId?: number): Promise<void> {
        const headSha = evidence.headSha;
        const current = await this.octokit.rest.pulls.get({
            owner: target.owner, repo: target.repository, pull_number: target.pullNumber,
        });
        if (current.data.head.sha !== headSha || current.data.base.ref !== evidence.baseRef
            || await this.readCurrentBaseSha(target, evidence.baseRef) !== evidence.baseSha) {
            throw new Error('PR head or base changed before assessment publication.');
        }
        const user = await this.octokit.rest.users.getAuthenticated();
        const comments = await this.allPages<ApprovalGithubComment>('comments', this.octokit.rest.issues.listComments, {
            owner: target.owner, repo: target.repository, issue_number: target.pullNumber,
        });
        const card = [...comments].reverse().find(comment => comment.user?.id === user.data.id
            && (comment.body ?? '').includes('<!-- copilot:approval-assessment:v1 -->'));
        const body = renderApprovalAssessment({ target, evidence, decision, locale: this.settings.locale ?? 'en-US',
            ...(reviewId ? { reviewId } : {}) });
        if (card) {
            if (card.body !== body) await this.octokit.rest.issues.updateComment({ owner: target.owner, repo: target.repository, comment_id: card.id, body });
        } else {
            await this.octokit.rest.issues.createComment({ owner: target.owner, repo: target.repository, issue_number: target.pullNumber, body });
        }
        if (this.checkOctokit) {
            const prior = await this.checkOctokit.rest.checks.listForRef({
                owner: target.owner, repo: target.repository, ref: headSha, check_name: 'Copilot / Approval', filter: 'all', per_page: 100,
            });
            if (prior.data.total_count > 100) throw new Error('Approval Check Run history exceeds the bounded lookup.');
            const externalId = `copilot:approval:${target.repositoryId}:${target.pullNumber}`;
            const matches = prior.data.check_runs.filter((check: { name: string; app?: { slug?: string } | null; external_id?: string | null }) => check.name === 'Copilot / Approval'
                && check.app?.slug === 'github-actions' && check.external_id === externalId);
            if (matches.length > 1) throw new Error('Approval Check Run identity is ambiguous.');
            const existing = matches[0];
            const fields = {
                owner: target.owner, repo: target.repository, name: 'Copilot / Approval', head_sha: headSha,
                external_id: externalId,
                status: 'completed',
                conclusion: decision.code === 'approved' || decision.status === 'already-approved' ? 'success'
                    : decision.status === 'blocked' ? 'failure' : 'neutral',
                output: { title: `PR approval: ${decision.status}`, summary: body.slice(0, 20_000) },
            } as const;
            if (existing) {
                await this.checkOctokit.rest.checks.update({
                    owner: target.owner, repo: target.repository, check_run_id: existing.id,
                    status: fields.status, conclusion: fields.conclusion, output: fields.output,
                });
            } else {
                await this.checkOctokit.rest.checks.create(fields);
            }
        }
    }

    private async readCurrentBaseSha(target: ApprovalObservationTarget, baseRef: string): Promise<string> {
        return readApprovalEvidence('base-ref', () => readCurrentBaseRevision(this.octokit.rest.git, target, baseRef));
    }

    private async effectiveRules(owner: string, repo: string, branch: string, diagnostics: ApprovalEvidenceDiagnostic[]): Promise<{
        readable: boolean; dismissesStaleReviews: boolean; requiredChecks: string[];
    }> {
        try {
            const rulesResponse = await readApprovalEvidence('rules', async () => this.octokit.request('GET /repos/{owner}/{repo}/rules/branches/{branch}', { owner, repo, branch }));
            if (!Array.isArray(rulesResponse.data) || rulesResponse.data.some((rule: unknown) => !record(rule)
                || typeof record(rule)?.type !== 'string' || record(rule)?.type === '')) {
                throw approvalEvidenceError('rules', 'invalid-response');
            }
            const rules = rulesResponse.data as Array<Record<string, unknown>>;
            let classic: Record<string, unknown> | undefined;
            try {
                const response = await this.octokit.rest.repos.getBranchProtection({ owner, repo, branch });
                if (!record(response.data)) throw approvalEvidenceError('classic-protection', 'invalid-response');
                classic = response.data as unknown as Record<string, unknown>;
            } catch (error) {
                if (statusOf(error) !== 404) await readApprovalEvidence('classic-protection', async () => { throw error; });
            }
            const reviewRules = rules.filter(rule => rule.type === 'pull_request');
            const classicReview = classic?.required_pull_request_reviews;
            const allStale = reviewRules.every(rule => record(rule.parameters)?.dismiss_stale_reviews_on_push === true)
                && (classicReview == null || record(classicReview)?.dismiss_stale_reviews === true);
            const hasStaleRule = reviewRules.length > 0 || classicReview != null;
            const requiredChecks = new Set<string>();
            const classicChecks = record(classic?.required_status_checks);
            for (const item of array(classicChecks?.contexts)) if (typeof item === 'string') requiredChecks.add(item);
            for (const item of array(classicChecks?.checks)) {
                const context = record(item)?.context;
                if (typeof context === 'string') requiredChecks.add(context);
            }
            for (const rule of rules.filter(item => item.type === 'required_status_checks')) {
                for (const item of array(record(rule.parameters)?.required_status_checks)) {
                    const context = record(item)?.context;
                    if (typeof context === 'string') requiredChecks.add(context);
                }
            }
            return { readable: true, dismissesStaleReviews: hasStaleRule && allStale, requiredChecks: [...requiredChecks] };
        } catch (cause) {
            collectDiagnostic(diagnostics, cause);
            return { readable: false, dismissesStaleReviews: false, requiredChecks: [] };
        }
    }

    private async allPages<T>(operation: ApprovalEvidenceOperation, method: unknown, params: Record<string, unknown>): Promise<T[]> {
        return readApprovalEvidence(operation, async () => {
            const result: T[] = [];
            for await (const response of this.octokit.paginate.iterator(method as never, { ...params, per_page: 100 } as never)) {
                const page = Array.isArray(response.data) ? response.data
                    : record(response.data)?.check_runs ?? record(response.data)?.workflow_runs
                        ?? record(response.data)?.artifacts ?? record(response.data)?.jobs;
                if (!Array.isArray(page)) throw approvalEvidenceError(operation, 'invalid-page');
                result.push(...page as T[]);
                if (result.length > 3000) throw approvalEvidenceError(operation, 'page-limit');
            }
            return result;
        });
    }
}

function parseBugbotCard(body: string, headSha: string, pullNumber: number): ApprovalBugbotFact | undefined {
    const status = body.match(/<!-- copilot-bugbot-status schema="1" pr="(\d+)" verified_head="([a-fA-F0-9]{7,64})" digest="([a-f0-9]{8})" -->/u);
    const evidence = body.match(/<!-- copilot-bugbot-approval-evidence schema="1" head="([a-fA-F0-9]{7,64})" digest="([a-f0-9]{8})" outcome="([a-z-]+)" coverage="([a-z-]+)" open="(\d+)" reopened="(\d+)" dismissed="(\d+)" verification="(\d+)" unknown="(\d+)" -->/u);
    if (!status || !evidence || Number(status[1]) !== pullNumber || status[2] !== headSha
        || evidence[1] !== headSha || status[3] !== evidence[2]) return undefined;
    const counts = evidence.slice(5).map(Number);
    if (counts.some(count => !Number.isSafeInteger(count))) return undefined;
    return {
        headSha, outcome: evidence[3], coverage: evidence[4],
        open: counts[0], reopened: counts[1], dismissed: counts[2],
        verificationRequired: counts[3], unknown: counts[4],
    };
}

/** Fixed metadata only: never interpolate error text, response bodies or credentials. */
function reportPolicyReadFailure(scope: 'repository-variable' | 'organization-variable', error: unknown): void {
    const status = statusOf(error);
    const code = [400, 401, 403, 409, 422, 429, 500, 502, 503, 504].includes(status as number)
        ? `http-${status}` : 'http-unavailable';
    logInfo(`Approval policy read failed (${scope}, ${code}).`);
}

function statusOf(error: unknown): number | undefined {
    return record(error)?.status as number | undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

/** Canonical repository-over-organization read shared with the physically read-only doctor binding. */
export async function readEffectiveApprovalPolicy(octokit: ReturnType<typeof github.getOctokit>,
    target: Pick<ApprovalObservationTarget, 'owner' | 'repository'>): Promise<{ source: 'repository' | 'organization'; value: string } | undefined> {
    const admit = (source: 'repository' | 'organization', value: unknown) => {
        if (typeof value !== 'string' || value.length > 65_536) throw new ApplicationError('provider.contract-invalid', 'Approval policy response is malformed or unbounded.');
        return { source, value };
    };
    try {
        const response = await octokit.rest.actions.getRepoVariable({ owner: target.owner, repo: target.repository, name: 'PR_APPROVAL_POLICY' });
        return admit('repository', response.data.value);
    } catch (error) {
        if (statusOf(error) !== 404) {
            reportPolicyReadFailure('repository-variable', error);
            throw error;
        }
    }
    try {
        const response = await octokit.rest.actions.getOrgVariable({ org: target.owner, name: 'PR_APPROVAL_POLICY' });
        return admit('organization', response.data.value);
    } catch (error) {
        if (statusOf(error) === 404) return undefined;
        reportPolicyReadFailure('organization-variable', error);
        throw error;
    }
}

function collectDiagnostic(diagnostics: ApprovalEvidenceDiagnostic[], cause: unknown): void {
    if (cause instanceof ApplicationError && cause.recovery?.id === 'approval-evidence-read-failed') {
        diagnostics.push(cause.recovery.variables);
    } else {
        diagnostics.push(approvalEvidenceError('evidence', 'invalid-response').recovery!.variables as ApprovalEvidenceDiagnostic);
    }
}
