import {
    isBugbotCanonicalStatusCard,
    publishBugbotStatusCard,
    type BugbotStatusCardEffect, type BugbotStatusCardSnapshot, type BugbotStatusCardSource, type BugbotStatusCardWakeup,
} from '../../application/policies/bugbot_status_card_publication_policy';
import { isTrustedBugbotAuthor } from '../../application/policies/bugbot_review_ownership_policy';
import { isBugbotStatusComment } from '../../application/policies/bugbot_review_presentation_policy';

interface GithubStatusCardComment {
    readonly id: number;
    readonly body: string | null;
    readonly user?: { readonly login?: string | null } | null;
}

interface AdmittedGithubStatusCardJob {
    readonly repositoryId: number;
    readonly pullNumber: number;
    readonly trustedAuthorLogin: string;
    readonly repositoryUrl: string;
    readonly locale: string;
    readonly verifiedBody?: string;
    readSource(): Promise<BugbotStatusCardSource | undefined>;
    readReview(): Promise<BugbotStatusCardSnapshot['review'] | undefined>;
    readComments(): Promise<readonly GithubStatusCardComment[] | undefined>;
    createComment(body: string): Promise<void>;
    updateComment(id: number, body: string): Promise<void>;
}

/**
 * The caller is the default-branch job admitted by the per-PR concurrency
 * group. All reads happen inside that job, including the check immediately
 * before the only canonical mutation.
 */
export function runAdmittedGithubBugbotStatusCardJob(
    wakeup: BugbotStatusCardWakeup, job: AdmittedGithubStatusCardJob,
): Promise<BugbotStatusCardEffect> {
    async function read(): Promise<BugbotStatusCardSnapshot | undefined> {
        const source = await job.readSource();
        if (!source) return undefined;
        const review = await job.readReview();
        if (!review) return undefined;
        const comments = await job.readComments();
        if (!comments) return undefined;
        const candidates = comments.filter(comment => isTrustedBugbotAuthor(comment.user?.login ?? undefined, job.trustedAuthorLogin)
            && typeof comment.body === 'string'
            && (isBugbotStatusComment(comment.body) || isBugbotCanonicalStatusCard(comment.body, job.pullNumber)));
        if (candidates.length > 1) return undefined;
        const [canonical] = candidates;
        return {
            source, review, locale: job.locale, repositoryUrl: job.repositoryUrl,
            ...(canonical?.body ? { canonical: { id: canonical.id, body: canonical.body } } : {}),
            ...(job.verifiedBody !== undefined ? { verifiedBody: job.verifiedBody } : {}),
        };
    }

    return publishBugbotStatusCard(wakeup, { async exclusive(repositoryId, pullNumber, operation) {
        if (job.repositoryId !== repositoryId || job.pullNumber !== pullNumber || !job.trustedAuthorLogin.trim()) return 'skipped';
        return operation({
            read,
            async isCurrent(snapshot) {
                return JSON.stringify(await read()) === JSON.stringify(snapshot)
                    && JSON.stringify(await job.readSource()) === JSON.stringify(snapshot.source);
            },
            publish({ id, body }) {
                return id === undefined ? job.createComment(body) : job.updateComment(id, body);
            },
        });
    } });
}
