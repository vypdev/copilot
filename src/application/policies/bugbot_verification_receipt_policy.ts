import {
    BUGBOT_RECEIPT_COUNT_KEYS, BUGBOT_VERIFICATION_RECEIPT_MARKER,
    type BugbotVerificationPublication,
} from '../../domain/bugbot/verification_receipt';
import { canonicalGitObjectId } from '../../domain/git_object_id';

export interface BugbotNativeAttempt {
    readonly runId: number;
    readonly attempt: number;
    readonly repositoryId: number;
    readonly pullNumber: number;
    readonly baseSha: string;
}

const positive = (value: number) => Number.isSafeInteger(value) && value > 0;

export function renderBugbotApprovalReceipt(
    publication: BugbotVerificationPublication | undefined,
    native: BugbotNativeAttempt | undefined,
    headSha: string,
): string | undefined {
    if (!publication || !native) return undefined;
    const { authority, repositoryId, pullNumber, baseSha, coverage, verification, outcome, findingStates } = publication;
    const { runId, attempt } = native;
    if (!authority || !['enforced', 'disabled', 'shadow'].includes(authority.mode)
        || ![repositoryId, pullNumber, runId, attempt, authority.generation, authority.workflowId, authority.sourceAppId].every(positive)
        || !/^[a-f0-9]{64}$/u.test(authority.policyDigest)
        || repositoryId !== native.repositoryId || pullNumber !== native.pullNumber
        || canonicalGitObjectId(headSha) !== headSha || headSha !== publication.headSha
        || canonicalGitObjectId(baseSha) !== baseSha || baseSha !== native.baseSha
        || coverage !== 'complete' || verification !== 'complete' || publication.publication !== 'verified' || outcome !== 'complete'
        || !findingStates || !BUGBOT_RECEIPT_COUNT_KEYS.every(key => Number.isSafeInteger(findingStates[key]) && findingStates[key] >= 0)) return undefined;
    const counts = Object.fromEntries(BUGBOT_RECEIPT_COUNT_KEYS.map(key => [key, findingStates[key]]));
    const receipt = { version: 1, repositoryId, pullNumber, headSha, baseSha, policyDigest: authority.policyDigest,
        generation: authority.generation, mode: authority.mode, runId, attempt, coverage, verification,
        publication: 'verified', outcome, findingStates: counts };
    return `<!-- ${BUGBOT_VERIFICATION_RECEIPT_MARKER} ${JSON.stringify(receipt)} -->`;
}
