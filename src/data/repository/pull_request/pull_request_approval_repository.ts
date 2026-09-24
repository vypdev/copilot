import * as github from '@actions/github';
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

    async readPolicy(target: ApprovalObservationTarget): Promise<string | undefined> {
        try {
            const response = await this.octokit.rest.actions.getRepoVariable({
                owner: target.owner, repo: target.repository, name: 'PR_APPROVAL_POLICY',
            });
            return response.data.value;
        } catch (error) {
            if (statusOf(error) !== 404) throw error;
        }
        // A repository Variable takes precedence over an accessible organization Variable.
        try {
            const response = await this.octokit.rest.actions.getOrgVariable({
                org: target.owner, name: 'PR_APPROVAL_POLICY',
            });
            return response.data.value;
        } catch (error) {
            if (statusOf(error) === 404) return undefined;
            throw error;
        }
    }

    async loadEvidence(target: ApprovalObservationTarget): Promise<ApprovalEvidence> {
        const { data: pull } = await this.octokit.rest.pulls.get({
            owner: target.owner, repo: target.repository, pull_number: target.pullNumber,
        });
        const headSha = pull.head.sha;
        const policy = parsePullRequestApprovalPolicy(await this.readPolicy(target));
        let testedMergeSha: string | undefined;
        if (pull.mergeable === true && /^[a-f0-9]{40}$/iu.test(pull.merge_commit_sha ?? '')) {
            try {
                const merge = await this.octokit.rest.git.getCommit({
                    owner: target.owner, repo: target.repository, commit_sha: pull.merge_commit_sha!,
                });
                if (merge.data.parents[0]?.sha === pull.base.sha && merge.data.parents[1]?.sha === headSha
                    && merge.data.parents.length === 2) testedMergeSha = pull.merge_commit_sha!;
            } catch { /* Missing or unreadable merge parentage is non-authorizing. */ }
        }
        const [files, reviews, comments, headChecks, mergeChecks, headRuns, mergeRuns, rules, user] = await Promise.all([
            this.allPages<ApprovalGithubFile>(this.octokit.rest.pulls.listFiles, { owner: target.owner, repo: target.repository, pull_number: target.pullNumber }),
            this.allPages<ApprovalGithubReview>(this.octokit.rest.pulls.listReviews, { owner: target.owner, repo: target.repository, pull_number: target.pullNumber }),
            this.allPages<ApprovalGithubComment>(this.octokit.rest.issues.listComments, { owner: target.owner, repo: target.repository, issue_number: target.pullNumber }),
            this.allPages<ApprovalGithubCheck>(this.octokit.rest.checks.listForRef, { owner: target.owner, repo: target.repository, ref: headSha, filter: 'all' as const }),
            testedMergeSha ? this.allPages<ApprovalGithubCheck>(this.octokit.rest.checks.listForRef, { owner: target.owner, repo: target.repository, ref: testedMergeSha, filter: 'all' as const }) : Promise.resolve([]),
            this.allPages<ApprovalGithubRun>(this.octokit.rest.actions.listWorkflowRunsForRepo, { owner: target.owner, repo: target.repository, head_sha: headSha }),
            testedMergeSha ? this.allPages<ApprovalGithubRun>(this.octokit.rest.actions.listWorkflowRunsForRepo, { owner: target.owner, repo: target.repository, head_sha: testedMergeSha }) : Promise.resolve([]),
            this.effectiveRules(target.owner, target.repository, pull.base.ref),
            this.octokit.rest.users.getAuthenticated(),
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
            jobs: await this.allPages<ApprovalGithubJob>(this.octokit.rest.actions.listJobsForWorkflowRunAttempt, {
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
            ? await this.numericCoverage(target, policy.coverage.artifactWorkflowName, headSha, pull.base.sha, testedMergeSha, workflowRuns)
            : undefined;
        return {
            repositoryId: pull.base.repo?.id ?? 0,
            pullNumber: pull.number,
            headSha,
            baseSha: pull.base.sha,
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
    ): Promise<ApprovalEvidence['numericCoverage'] | undefined> {
        const candidates = workflowRuns.filter(run => run.name === workflowName
            && (run.head_sha === headSha || run.head_sha === testedMergeSha));
        const mergeCandidates = candidates.filter(run => run.head_sha === testedMergeSha);
        const authoritative = mergeCandidates.length > 0 ? mergeCandidates : candidates;
        const run = [...authoritative].sort((left, right) => right.id - left.id || right.run_attempt - left.run_attempt)[0];
        if (!run || run.conclusion !== 'success' || run.status !== 'completed') return undefined;
        try {
            const artifacts = await this.allPages<ApprovalGithubArtifact>(this.octokit.rest.actions.listWorkflowRunArtifacts, {
                owner: target.owner, repo: target.repository, run_id: run.id,
            });
            const matches = artifacts.filter(artifact => artifact.name === 'copilot-diff-coverage-v1' && !artifact.expired);
            if (matches.length !== 1 || matches[0].size_in_bytes > 64 * 1024) return undefined;
            const response = await this.octokit.rest.actions.downloadArtifact({
                owner: target.owner, repo: target.repository, artifact_id: matches[0].id, archive_format: 'zip',
            });
            const data = response.data;
            const bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
                : data instanceof Uint8Array ? data
                    : typeof data === 'string' ? Buffer.from(data, 'binary') : undefined;
            const attestation = bytes ? parseApprovalCoverageZip(bytes) : undefined;
            if (!attestation || attestation.repositoryId !== target.repositoryId
                || attestation.pullNumber !== target.pullNumber || attestation.headSha !== headSha
                || attestation.baseSha !== baseSha || attestation.workflowRunId !== run.id
                || attestation.workflowRunAttempt !== run.run_attempt) return undefined;
            return {
                coveredChangedLines: attestation.coveredChangedLines,
                totalChangedLines: attestation.totalChangedLines,
                headSha,
                baseSha,
            };
        } catch { return undefined; }
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
        if (current.data.head.sha !== headSha || current.data.base.sha !== evidence.baseSha) {
            throw new Error('PR head or base changed before assessment publication.');
        }
        const user = await this.octokit.rest.users.getAuthenticated();
        const comments = await this.allPages<ApprovalGithubComment>(this.octokit.rest.issues.listComments, {
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

    private async effectiveRules(owner: string, repo: string, branch: string): Promise<{
        readable: boolean; dismissesStaleReviews: boolean; requiredChecks: string[];
    }> {
        try {
            const rulesResponse = await this.octokit.request('GET /repos/{owner}/{repo}/rules/branches/{branch}', { owner, repo, branch });
            const rules = Array.isArray(rulesResponse.data) ? rulesResponse.data as Array<Record<string, unknown>> : [];
            let classic: Record<string, unknown> | undefined;
            try {
                const response = await this.octokit.rest.repos.getBranchProtection({ owner, repo, branch });
                classic = response.data as unknown as Record<string, unknown>;
            } catch (error) {
                if (statusOf(error) !== 404) throw error;
            }
            const reviewRules = rules.filter(rule => rule.type === 'pull_request');
            const classicReview = record(classic?.required_pull_request_reviews);
            const allStale = reviewRules.every(rule => record(rule.parameters)?.dismiss_stale_reviews === true)
                && (!classicReview || classicReview.dismiss_stale_reviews === true);
            const hasStaleRule = reviewRules.length > 0 || classicReview !== undefined;
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
        } catch {
            return { readable: false, dismissesStaleReviews: false, requiredChecks: [] };
        }
    }

    private async allPages<T>(method: unknown, params: Record<string, unknown>): Promise<T[]> {
        const result: T[] = [];
        for await (const response of this.octokit.paginate.iterator(method as never, { ...params, per_page: 100 } as never)) {
            const page = Array.isArray(response.data) ? response.data
                : record(response.data)?.check_runs ?? record(response.data)?.workflow_runs
                    ?? record(response.data)?.artifacts ?? record(response.data)?.jobs;
            if (!Array.isArray(page)) throw new Error('GitHub pagination returned an invalid page.');
            result.push(...page as T[]);
            if (result.length > 3000) throw new Error('Approval evidence pagination exceeded the safe bound.');
        }
        return result;
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

function statusOf(error: unknown): number | undefined {
    return record(error)?.status as number | undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
