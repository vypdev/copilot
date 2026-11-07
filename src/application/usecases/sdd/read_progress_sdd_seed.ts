import type { ProgressSddPublication, ProgressSddSeedQuery, ProgressSddSeedRequest } from '../../ports/progress_sdd_seed_ports';
import { progressSddSeedUnavailable } from '../../policies/progress_sdd_scope_policy';
import type { SddEvidenceReadPorts } from '../../ports/sdd_evidence_read_ports';
import { buildSddIssueDigest } from '../../policies/sdd_issue_identity_policy';
import { selectOwnedSddCard, type SddQueryComment } from '../../policies/sdd_query_card_policy';
import { isSddSeedReview, matchesSddSelection, readSddSelectionAnswer, sddArtifactDigest, sddSelectionReceipt } from '../../policies/sdd_selection_policy';
import { composeSddUpdate } from '../../../domain/pre_branch_sdd';
import { explicitSddObligations } from '../../../domain/sdd_incremental_plan';
import type { PreBranchSddWorkspacePort } from '../../ports/pre_branch_sdd_ports';
import { assembleAndValidateSdd } from './pre_branch_sdd_incremental_workflow';

type Reads = Pick<SddEvidenceReadPorts, 'actors' | 'branches' | 'comments' | 'titles'> & {
    readonly workspace: Pick<PreBranchSddWorkspacePort, 'verifyPublication' | 'readSdd' | 'isAncestor'>;
};

/** Use the gate's Action-owned receipt, live selection and immutable publication at the assessed head. */
export function createProgressSddSeedQuery(reads: Reads, repositoryUrl: string): ProgressSddSeedQuery {
    return async request => {
        try {
            return await readPublication(reads, repositoryUrl, request);
        } catch {
            // Publication text and provider errors are not safe check output.
            throw progressSddSeedUnavailable();
        }
    };
}

async function readPublication(reads: Reads, repositoryUrl: string, request: ProgressSddSeedRequest): Promise<ProgressSddPublication> {
    const { issueNumber, issueBody, issueKind, profileDigest, trustedBotLogin, branch, headSha, seed, seedHash } = request;
    const issueUrl = repositoryUrl + '/issues/' + issueNumber;
    const [comments, title, linked] = await Promise.all([
        reads.comments.listIssueComments(issueNumber), reads.titles.getTitle(issueNumber),
        reads.branches.getLinkedBranch(issueNumber, branch),
    ]);
    const { coverage } = comments;
    if (!trustedBotLogin || !issueKind || title === undefined || linked?.name !== branch || linked.headSha !== headSha
        || coverage.source !== 'issue-comments' || coverage.status !== 'complete' || coverage.limitReached
        || coverage.providerLimitReached || coverage.omittedItems !== 0 || coverage.truncatedItems !== 0) throw progressSddSeedUnavailable();
    const card = selectOwnedSddCard(comments.value, issueNumber, trustedBotLogin);
    if (card.state !== 'valid') throw progressSddSeedUnavailable();
    const { record } = card;
    const { selection, selectionArtifact, plan } = record;
    const commitSha = record.revisionSha ?? record.commitSha;
    const base = record.revisionBaseSha ?? record.baseSha;
    if (record.phase !== 'published' || record.branchName !== branch || !commitSha || !selectionArtifact
        || selection?.kind !== 'seed' || selection.issueScope !== issueUrl || selection.seedHash !== seedHash
        || buildSddIssueDigest({ issueNumber, issueTitle: title, issueBody, admittedKind: issueKind, profileDigest }, record.baseSha) !== record.issueDigest
        || sddSelectionReceipt({ ...record, baseSha: base }, plan, 'seed', seedHash, selection.newCapability, issueUrl) !== selection.receipt) {
        throw progressSddSeedUnavailable();
    }

    const review = comments.value.filter(comment => comment.id === selection.reviewCommentId);
    const selected = (record.answers ?? []).filter(answer => matchesSddSelection(selection, answer.text));
    const answer = comments.value.filter(comment => comment.id === selected[0]?.commentId);
    const reviewer = review[0]?.user?.login;
    const actor = answer[0]?.user?.login;
    if (review.length !== 1 || !reviewer || reviewer.toLowerCase() === trustedBotLogin.toLowerCase()
        || !isSddSeedReview(review[0].body ?? '', seedHash)
        || selected.length !== 1 || selected[0].text !== 'use seed ' + selection.receipt || answer.length !== 1 || answer[0].id <= review[0].id || !actor
        || actor.toLowerCase() === trustedBotLogin.toLowerCase() || actor.toLowerCase() !== selected[0].author.toLowerCase()
        || readSddSelectionAnswer(answer[0].body ?? '', selection) !== selected[0].text
        || !await reads.actors.isActorAllowedToModifyFiles(reviewer)
        || (actor.toLowerCase() !== reviewer.toLowerCase() && !await reads.actors.isActorAllowedToModifyFiles(actor))
        || !await reads.workspace.verifyPublication(branch, base, commitSha, plan.path)
        || !await reads.workspace.isAncestor(commitSha, headSha)) throw progressSddSeedUnavailable();

    const published = await reads.workspace.readSdd(commitSha, plan.path);
    const evaluated = await reads.workspace.readSdd(headSha, plan.path);
    if (published === undefined || evaluated !== published || sddArtifactDigest(published) !== selectionArtifact) throw progressSddSeedUnavailable();
    const owner = plan.action === 'update' ? await reads.workspace.readSdd(base, plan.path) : undefined;
    if (plan.action === 'update' && owner === undefined) throw progressSddSeedUnavailable();
    await assembleAndValidateSdd(seed, plan, explicitSddObligations([]), async assembled => {
        const expected = owner === undefined ? assembled : composeSddUpdate(owner, assembled);
        if (expected !== published) throw progressSddSeedUnavailable();
    });
    return { issueUrl, cardId: card.id, path: plan.path, commitSha, artifactHash: selectionArtifact };
}


/** Positive evidence of a selected draft remains relevant if both markers disappear from the issue. */
export function expectsPublishedProgressSeed(comments: readonly SddQueryComment[], issueNumber: number, botLogin: string): boolean {
    const card = selectOwnedSddCard(comments, issueNumber, botLogin);
    if (card.state !== 'valid' || card.record.phase !== 'published') return false;
    const { selection } = card.record;
    return selection?.kind === 'seed' && (card.record.answers ?? []).some(answer => answer.text === 'use seed ' + selection.receipt);
}
