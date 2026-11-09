import type { ApprovalBugbotFact } from '../../../domain/pull_request_approval';

/** Supplied by trusted runtime configuration. Rollback also requires a receipt. */
export type ApprovalBugbotVerificationPolicy =
    | { readonly mode: 'disabled' | 'shadow'; readonly requireReceipt: false }
    | { readonly mode: 'disabled' | 'shadow' | 'enforced'; readonly requireReceipt: true;
        readonly generation: number; readonly policyDigest: string;
        readonly workflowId: number; readonly sourceAppId: number };

export interface ApprovalBugbotVerificationRun {
    readonly id: number;
    readonly workflow_id?: number;
    readonly head_sha: string;
    readonly check_suite_id?: number;
    readonly run_attempt: number;
    readonly status: string;
    readonly conclusion: string | null;
    readonly pull_requests?: readonly { readonly number: number }[];
}

export interface ApprovalBugbotVerificationCheck {
    readonly name: string;
    readonly app?: { readonly id?: number } | null;
    readonly head_sha: string;
    readonly conclusion: string | null;
    readonly status: string;
    readonly check_suite?: { readonly id: number } | null;
    readonly output?: { readonly summary?: string | null };
}

interface ApprovalVerificationScope {
    readonly repositoryId: number;
    readonly pullNumber: number;
    readonly headSha: string;
    readonly baseSha: string;
    readonly testedMergeSha?: string;
}

const marker = /<!-- copilot-bugbot-verification:v1 ([^\r\n]{1,4096}) -->/gu;
const counts = ['open', 'reopened', 'dismissed', 'verificationRequired', 'unknown', 'fixed', 'obsolete'] as const;
const receiptKeys = ['version', 'repositoryId', 'pullNumber', 'headSha', 'baseSha', 'policyDigest', 'generation',
    'mode', 'runId', 'attempt', 'coverage', 'verification', 'publication', 'outcome', 'findingStates'];

export function readApprovalBugbotVerification(
    policy: Extract<ApprovalBugbotVerificationPolicy, { requireReceipt: true }>,
    scope: ApprovalVerificationScope,
    runs: readonly ApprovalBugbotVerificationRun[],
    checks: readonly ApprovalBugbotVerificationCheck[],
): ApprovalBugbotFact | undefined {
    if (!positive(policy.generation) || !positive(policy.workflowId) || !positive(policy.sourceAppId)
        || !/^[a-f0-9]{64}$/u.test(policy.policyDigest)) return undefined;
    const ordered = runs.filter(run => run.workflow_id === policy.workflowId
        && (run.head_sha === scope.headSha || run.head_sha === scope.testedMergeSha)
        && (!Array.isArray(run.pull_requests) || run.pull_requests.length === 0
            || run.pull_requests.some(pr => pr?.number === scope.pullNumber)))
        .sort((left, right) => right.id - left.id || right.run_attempt - left.run_attempt);
    const latest = ordered[0];
    if (!latest || !positive(latest.id) || !positive(latest.run_attempt) || !positive(latest.check_suite_id)
        || !latest.pull_requests?.some(pr => pr?.number === scope.pullNumber)
        || latest.status !== 'completed' || latest.conclusion !== 'success'
        || (ordered[1]?.id === latest.id && ordered[1].run_attempt === latest.run_attempt)) return undefined;

    const facts = checks.flatMap(check => {
        if (check.name !== 'Copilot / Review' || check.app?.id !== policy.sourceAppId
            || check.head_sha !== latest.head_sha || check.check_suite?.id !== latest.check_suite_id
            || check.status !== 'completed') return [];
        const summary = check.output?.summary;
        if (typeof summary !== 'string' || summary.length > 65_536) return [];
        const matches = [...summary.matchAll(marker)];
        if (matches.length !== 1) return [];
        const fact = parseReceipt(matches[0][1], scope, policy, latest, check.conclusion);
        return fact ? [fact] : [];
    });
    return facts.length === 1 ? facts[0] : undefined;
}

function parseReceipt(
    json: string,
    scope: ApprovalVerificationScope,
    policy: Extract<ApprovalBugbotVerificationPolicy, { requireReceipt: true }>,
    run: ApprovalBugbotVerificationRun,
    checkConclusion: string | null,
): ApprovalBugbotFact | undefined {
    let receipt: unknown;
    try { receipt = JSON.parse(json); } catch { return undefined; }
    if (!isRecord(receipt) || !exactKeys(receipt, receiptKeys) || receipt.version !== 1
        || receipt.repositoryId !== scope.repositoryId || receipt.pullNumber !== scope.pullNumber
        || receipt.headSha !== scope.headSha || receipt.baseSha !== scope.baseSha
        || receipt.policyDigest !== policy.policyDigest || receipt.generation !== policy.generation
        || receipt.mode !== policy.mode || receipt.runId !== run.id || receipt.attempt !== run.run_attempt
        || receipt.coverage !== 'complete' || receipt.verification !== 'complete'
        || receipt.publication !== 'verified' || receipt.outcome !== 'complete'
        || checkConclusion !== 'success') return undefined;
    const state = receipt.findingStates;
    if (!isRecord(state) || !exactKeys(state, counts) || !counts.every(key => Number.isSafeInteger(state[key]) && (state[key] as number) >= 0)) return undefined;
    return {
        headSha: scope.headSha, outcome: 'complete', coverage: 'complete',
        verificationReceipt: { runId: run.id, attempt: run.run_attempt,
            generation: policy.generation, policyDigest: policy.policyDigest },
        open: state.open as number, reopened: state.reopened as number, dismissed: state.dismissed as number,
        verificationRequired: state.verificationRequired as number, unknown: state.unknown as number,
    };
}

function positive(value: number | undefined): boolean {
    return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
    const actual = Object.keys(record);
    return actual.length === keys.length && keys.every(key => actual.includes(key));
}
