import { createHash } from 'node:crypto';
import { normalizeSddIssueTitle } from '../../domain/pre_branch_sdd';
import { getVisibleIssueDescription } from './recommendation_policy';

export interface SddIssueIdentity {
    readonly issueNumber: number;
    readonly issueTitle: string;
    readonly issueBody: string;
    readonly admittedKind: string;
    readonly profileDigest?: string;
}

/** Producer and read-only queries use the same identity and immutable first base. */
export function buildSddIssueDigest(context: SddIssueIdentity, baseSha: string): string {
    return createHash('sha256').update(JSON.stringify([
        context.issueNumber, normalizeSddIssueTitle(context.issueTitle), getVisibleIssueDescription(context.issueBody),
        context.admittedKind, context.profileDigest ?? '', baseSha,
    ])).digest('hex');
}
