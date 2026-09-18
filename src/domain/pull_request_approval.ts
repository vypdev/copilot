import type {
    PullRequestApprovalBranchKind,
    PullRequestApprovalPolicy,
    PullRequestApprovalTargetRole,
} from './pull_request_approval_policy';
import { FIXED_APPROVAL_EXCLUSIONS } from './pull_request_approval_policy';

export interface ApprovalCheckFact {
    readonly name: string;
    readonly sourceAppId: number;
    readonly workflowName: string;
    readonly headSha: string;
    readonly conclusion: string | null;
    readonly status: string;
    readonly runId: number;
    readonly attempt: number;
}

export interface ApprovalReviewFact {
    readonly id: number;
    readonly userId: number;
    readonly state: string;
    readonly commitId: string;
    readonly submittedAt: string;
}

export interface ApprovalBugbotFact {
    readonly headSha: string;
    readonly outcome: string;
    readonly coverage: string;
    readonly open: number;
    readonly reopened: number;
    readonly dismissed: number;
    readonly verificationRequired: number;
    readonly unknown: number;
}

export interface ApprovalEvidence {
    readonly repositoryId: number;
    readonly pullNumber: number;
    readonly headSha: string;
    readonly baseSha: string;
    /** Verified test-merge commit whose parents are exactly the current base and head. */
    readonly testedMergeSha?: string;
    readonly mergeCommitVerified: boolean;
    readonly baseRef: string;
    readonly targetRole?: PullRequestApprovalTargetRole;
    readonly branchKind?: PullRequestApprovalBranchKind;
    readonly linkedIssue: boolean;
    readonly open: boolean;
    readonly draft: boolean;
    readonly sameRepository: boolean;
    readonly authorId: number;
    readonly authorIsBot: boolean;
    readonly botUserId: number;
    readonly changedPaths: readonly string[];
    readonly ignoredChangedPaths?: readonly string[];
    readonly filesComplete: boolean;
    readonly rulesReadable: boolean;
    readonly dismissesStaleReviews: boolean;
    readonly requiredChecks: readonly string[];
    readonly checks: readonly ApprovalCheckFact[];
    readonly bugbot?: ApprovalBugbotFact;
    readonly bugbotSeverity: string;
    readonly bugbotDryRun: boolean;
    readonly reviews: readonly ApprovalReviewFact[];
    readonly reviewHistoryComplete: boolean;
    readonly numericCoverage?: { readonly coveredChangedLines: number; readonly totalChangedLines: number; readonly headSha: string; readonly baseSha: string };
}

export type ApprovalDecisionStatus = 'off' | 'pending' | 'recommend' | 'blocked' | 'eligible' | 'already-approved';
export interface ApprovalDecision {
    readonly status: ApprovalDecisionStatus;
    readonly code: string;
    readonly detail: string;
}

/** Pure, intentionally conservative decision. Every unknown provider fact blocks mutation. */
export function decidePullRequestApproval(
    policy: PullRequestApprovalPolicy,
    evidence: ApprovalEvidence,
): ApprovalDecision {
    const stop = (status: ApprovalDecisionStatus, code: string, detail: string): ApprovalDecision => ({ status, code, detail });
    if (policy.mode === 'off') return stop('off', 'disabled', 'Automatic approval is disabled.');
    if (!evidence.open || evidence.draft || !evidence.sameRepository || !evidence.filesComplete) {
        return stop('recommend', 'unsupported-pr', 'Only open, non-draft, complete same-repository pull requests are eligible.');
    }
    if (!evidence.targetRole || !policy.targetRoles.includes(evidence.targetRole)
        || !evidence.branchKind || !policy.branchKinds.includes(evidence.branchKind)
        || (policy.requireLinkedIssue && !evidence.linkedIssue)) {
        return stop('recommend', 'scope', 'This pull request is outside the configured approval scope.');
    }
    if (evidence.authorIsBot || evidence.authorId === evidence.botUserId || evidence.botUserId <= 0) {
        return stop('recommend', 'bot-author', 'A human must review pull requests opened by the approval bot or another bot.');
    }
    const excluded = evidence.changedPaths.find(path =>
        [...FIXED_APPROVAL_EXCLUSIONS, ...policy.additionalExcludedPaths].some(glob => matchesGlob(path, glob)));
    if (excluded) return stop('recommend', 'protected-path', 'A protected workflow, policy, or trust-boundary file changed.');
    if ((evidence.ignoredChangedPaths?.length ?? 0) > 0) {
        return stop('blocked', 'bugbot-ignored-path', 'Bugbot excluded a changed file from its review; its clean result cannot authorize approval.');
    }
    if (!evidence.rulesReadable || !evidence.dismissesStaleReviews) {
        return stop('blocked', 'unsafe-rules', 'Effective branch rules must be readable and dismiss stale approvals.');
    }
    if (!policy.producerAttested) {
        return stop('blocked', 'producer-unattested', 'The exact CI producer and coverage-enforcing step have not been attested by the operator.');
    }
    if (policy.coverage.mode === 'numeric' && !policy.coverage.reporterAttested) {
        return stop('blocked', 'reporter-unattested', 'The numeric coverage reporter is not confirmed as installed in trusted CI.');
    }
    if (!evidence.mergeCommitVerified || !evidence.testedMergeSha) {
        return stop('pending', 'merge-ref-unavailable', 'Waiting for a verified test merge of the current base and head.');
    }
    if (evidence.requiredChecks.includes('Copilot / Approval')) {
        return stop('blocked', 'approval-check-cycle', 'Copilot / Approval cannot be its own required prerequisite.');
    }
    if (evidence.bugbotSeverity !== 'info' || evidence.bugbotDryRun) {
        return stop('blocked', 'bugbot-configuration', 'Bugbot must run with info severity and dry-run disabled.');
    }
    const selected = [...policy.testChecks];
    const required = new Set([...evidence.requiredChecks, ...selected.map(check => check.name)]);
    for (const name of required) {
        const producer = selected.find(check => check.name === name);
        if (!producer) {
            return stop('blocked', 'check-producer-unconfigured', `Required check ${name} has no trusted producer configured.`);
        }
        const mergeCandidates = evidence.checks.filter(check => check.name === name && check.headSha === evidence.testedMergeSha);
        const candidates = mergeCandidates.length > 0 ? mergeCandidates
            : evidence.checks.filter(check => check.name === name && check.headSha === evidence.headSha);
        if (candidates.length === 0) return stop('pending', 'check-missing', `Waiting for current-head check: ${name}.`);
        const latest = [...candidates].sort((left, right) => right.runId - left.runId || right.attempt - left.attempt)[0];
        if (latest.sourceAppId !== producer.sourceAppId || latest.workflowName !== producer.workflowName) {
            return stop('blocked', 'check-source', `The source of check ${name} differs from the configured producer.`);
        }
        if (candidates.filter(check => check.runId === latest.runId && check.attempt === latest.attempt).length !== 1) {
            return stop('blocked', 'check-ambiguous', `Check ${name} has ambiguous latest attempts.`);
        }
        if (latest.status !== 'completed') return stop('pending', 'check-pending', `Waiting for check: ${name}.`);
        if (latest.conclusion !== 'success') return stop('blocked', 'check-failed', `Check ${name} did not succeed.`);
    }
    const bugbot = evidence.bugbot;
    if (!bugbot || bugbot.headSha !== evidence.headSha) return stop('pending', 'bugbot-missing', 'Waiting for a complete Bugbot review of this head.');
    if (bugbot.outcome !== 'complete' || bugbot.coverage !== 'complete') {
        return stop('blocked', 'bugbot-incomplete', 'Bugbot review evidence is partial, failed, or superseded.');
    }
    if (bugbot.open + bugbot.reopened + bugbot.verificationRequired + bugbot.unknown > 0
        || (!policy.allowHumanDismissed && bugbot.dismissed > 0)) {
        return stop('blocked', 'bugbot-findings', 'Bugbot has unresolved, unknown, or policy-blocked dismissed findings.');
    }
    // A complete, explicitly classified documentation-only diff has no
    // measurable executable lines. It still needs every declared CI and
    // Bugbot gate above; a zero-line code diff is never exempt.
    if (policy.coverage.mode === 'numeric' && !isDocumentationOnlyDiff(evidence.changedPaths)) {
        const coverage = evidence.numericCoverage;
        if (!coverage || coverage.headSha !== evidence.headSha || coverage.baseSha !== evidence.baseSha
            || !Number.isSafeInteger(coverage.coveredChangedLines) || !Number.isSafeInteger(coverage.totalChangedLines)
            || coverage.totalChangedLines <= 0 || coverage.coveredChangedLines < 0
            || coverage.coveredChangedLines > coverage.totalChangedLines) {
            return stop('blocked', 'coverage-evidence', 'Current-head numeric coverage evidence is missing or invalid.');
        }
        if (coverage.coveredChangedLines * 100 < coverage.totalChangedLines * policy.coverage.minDiffPercent) {
            return stop('blocked', 'coverage-low', 'Diff coverage is below the configured threshold.');
        }
    }
    if (!evidence.reviewHistoryComplete) return stop('blocked', 'reviews-unavailable', 'Native review history is incomplete.');
    const botReviewsForHead = evidence.reviews.filter(review => review.userId === evidence.botUserId && review.commitId === evidence.headSha);
    if (botReviewsForHead.some(review => review.state === 'DISMISSED')) {
        return stop('recommend', 'approval-dismissed', 'A maintainer dismissed the bot approval for this revision.');
    }
    if (botReviewsForHead.some(review => review.state === 'APPROVED')) {
        return stop('already-approved', 'existing-approval', 'The bot already approved this exact revision.');
    }
    const latestByUser = new Map<number, ApprovalReviewFact>();
    for (const review of [...evidence.reviews].sort((left, right) => left.submittedAt.localeCompare(right.submittedAt) || left.id - right.id)) {
        latestByUser.set(review.userId, review);
    }
    if ([...latestByUser.values()].some(review => review.userId !== evidence.botUserId && review.state === 'CHANGES_REQUESTED')) {
        return stop('blocked', 'changes-requested', 'A human reviewer requested changes.');
    }
    if (policy.skipWhenHumanApproved && [...latestByUser.values()].some(review =>
        review.userId !== evidence.botUserId && review.state === 'APPROVED' && review.commitId === evidence.headSha)) {
        return stop('recommend', 'human-approved', 'A human has already approved this revision.');
    }
    if (policy.mode === 'recommend') return stop('recommend', 'recommend-mode', 'Evidence passed; a human reviewer must decide.');
    return stop('eligible', 'eligible', 'Current-revision evidence and safety rules permit one native approval.');
}

export function isDocumentationOnlyDiff(paths: readonly string[]): boolean {
    return paths.length > 0 && paths.every(path =>
        /^(?:docs\/|documentation\/)[A-Za-z0-9._/-]+\.(?:md|mdx|txt)$/iu.test(path)
        || /^(?:README|CHANGELOG|CONTRIBUTING)\.md$/iu.test(path));
}

function matchesGlob(path: string, glob: string): boolean {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/gu, '\\$&')
        .replace(/\*\*/gu, '\u0000')
        .replace(/\*/gu, '[^/]*')
        .replace(/\?/gu, '[^/]')
        .split('\u0000').join('.*');
    return new RegExp(`^${escaped}$`, 'u').test(path);
}
