import { createHash } from 'node:crypto';
import { decideIssueStart } from '../../../domain/issue_start_policy';
import { parseSddAnswer, parseSddPlan, type SddGateRecord } from '../../../domain/pre_branch_sdd';
import { bindSddEvidenceReadPorts, type SddEvidenceQueryContext, type SddEvidenceReadPorts, type VerifiedSddEvidence, type SddEvidenceSnapshot } from '../../ports/sdd_evidence_read_ports';
import type { SddCatalogSnapshot } from '../../ports/pre_branch_sdd_ports';
import { buildSddIssueDigest } from '../../policies/sdd_issue_identity_policy';
import { selectOwnedSddCard, type SddQueryComment } from '../../policies/sdd_query_card_policy';

export type { VerifiedSddEvidence, SddEvidenceSnapshot } from '../../ports/sdd_evidence_read_ports';

interface ReadFacts {
    readonly title: string;
    readonly body: string;
    readonly labels: readonly string[];
    readonly comments: readonly SddQueryComment[];
}
const MAX_AUTHORIZATION_LOOKUPS = 16;

/** Reads gate authority and immutable publication evidence without any mutation or model capability. */
export class SddEvidenceQueryUseCase {
    private readonly ports: SddEvidenceReadPorts;
    constructor(ports: SddEvidenceReadPorts) { this.ports = bindSddEvidenceReadPorts(ports); }

    async read(context: SddEvidenceQueryContext): Promise<SddEvidenceSnapshot> {
        try {
            if (!Number.isSafeInteger(context.issueNumber) || context.issueNumber < 1
                || typeof context.issueManagedBranches !== 'boolean' || typeof context.preBranchSdd !== 'boolean'
                || !context.admittedKind) return { state: 'unavailable' };
            decideIssueStart({ kind: context.admittedKind, labels: [], issueManagedBranches: context.issueManagedBranches, preBranchSdd: context.preBranchSdd });
            if (context.admittedKind === 'help' || !context.preBranchSdd) return { state: 'not-required' };
            const facts = await this.readFacts(context.issueNumber);
            if (!this.required(context, facts.labels)) return { state: 'not-required' };
            const selection = selectOwnedSddCard(facts.comments, context.issueNumber, context.trustedBotLogin);
            if (selection.state !== 'valid') return { state: selection.state };
            const { record, id: cardId } = selection;
            const digest = this.digest(context, facts, record.baseSha);
            const stale = digest !== record.issueDigest;
            const result = await this.inspectRecord(context, facts, record, cardId, stale, new Map());
            if (!['invalid', 'unavailable'].includes(result.state)
                && !await this.fence(context, facts, selection.body, cardId, record, result.verified)) return { state: 'stale' };
            return Object.freeze({ ...result, ...(!['invalid', 'unavailable'].includes(result.state) ? {
                authorityDigest: createHash('sha256').update(JSON.stringify([cardId, selection.body, digest, canonicalLabels(facts.labels),
                    record.phase === 'awaiting-answer' ? facts.comments : null])).digest('hex'),
            } : {}) });
        } catch { return { state: 'unavailable' }; }
    }

    private async inspectRecord(context: SddEvidenceQueryContext, facts: ReadFacts, record: SddGateRecord, cardId: number, stale: boolean,
        authorizations: Map<string, Promise<boolean>>): Promise<SddEvidenceSnapshot> {
        const path = record.plan.path;
        let verified: VerifiedSddEvidence | undefined;
        if (record.commitSha) {
            if (!record.branchName) return { state: 'invalid' };
            const linked = await this.ports.branches.getLinkedBranch(context.issueNumber, record.branchName);
            if (linked?.name !== record.branchName || !fullSha(linked.headSha)) return { state: 'invalid' };
            if (!await this.ports.workspace.verifyPublication(record.branchName, record.baseSha, record.commitSha, path)
                || !await this.ports.workspace.isAncestor(record.commitSha, linked.headSha)) return { state: 'invalid' };
            if (!ownedAt(await this.ports.workspace.loadSnapshotAtCommit(record.commitSha), record.commitSha, record)) return { state: 'invalid' };
            verified = Object.freeze({ path, capabilityId: record.plan.capabilityId, branchName: record.branchName,
                branchHeadSha: linked.headSha, firstSha: record.commitSha });
            if (record.phase === 'published') {
                const currentSha = record.revisionSha ?? record.commitSha;
                if (record.revisionSha && (!record.revisionBaseSha
                    || !await this.ports.workspace.isAncestor(record.commitSha, record.revisionBaseSha)
                    || !await this.ports.workspace.verifyPublication(record.branchName, record.revisionBaseSha, record.revisionSha, path)
                    || !await this.ports.workspace.isAncestor(record.revisionSha, linked.headSha)
                    || !ownedAt(await this.ports.workspace.loadSnapshotAtCommit(record.revisionSha), record.revisionSha, record))) return { state: 'invalid' };
                verified = Object.freeze({ ...verified, currentSha });
            }
        } else {
            if (record.phase === 'published') return { state: 'invalid' };
            const source = record.branchName ?? context.baseBranch;
            if (!source) return { state: 'unavailable' };
            if (record.branchName) {
                const linked = await this.ports.branches.getLinkedBranch(context.issueNumber, record.branchName);
                if (linked?.name !== record.branchName || linked.headSha !== record.baseSha) return { state: 'invalid' };
            }
            const snapshot = await this.ports.workspace.loadSnapshot(source);
            if (snapshot.baseSha !== record.baseSha) return { state: 'stale' };
            try { parseSddPlan(record.plan, new Map(snapshot.capabilities.map(capability => [capability.id, capability.specs]))); }
            catch { return { state: 'invalid' }; }
        }
        if (stale) return { state: 'stale', ...(verified ? { verified } : {}) };
        if (record.phase === 'published') return { state: 'published', path, cardId, verified };
        const pendingQuestionIds = await this.pendingQuestions(context, facts.comments, record, cardId, authorizations);
        return { state: pendingQuestionIds.length ? 'awaiting-answers' : 'publication-pending', path, cardId,
            pendingQuestionIds: Object.freeze(pendingQuestionIds), ...(verified ? { verified } : {}) };
    }

    private async pendingQuestions(context: SddEvidenceQueryContext, comments: readonly SddQueryComment[], record: SddGateRecord, cardId: number,
        authorizations: Map<string, Promise<boolean>>): Promise<string[]> {
        const pending: string[] = [];
        const cutoff = Math.max(cardId, ...(record.answers ?? []).map(answer => answer.commentId));
        for (const question of record.plan.questions) {
            const retained = (record.answers ?? []).filter(answer => {
                const provenance = answer as typeof answer & { readonly round?: number; readonly questionText?: string };
                return Number.isSafeInteger(answer.commentId) && provenance.round === record.round
                    && answer.questionId === question.id && provenance.questionText === question.text;
            });
            let answered = false;
            for (const answer of retained) if (await this.authorized(context, question.owner, answer.author, authorizations)) { answered = true; break; }
            if (!answered) {
                for (const comment of [...comments].sort((a, b) => b.id - a.id)) {
                    if (!Number.isSafeInteger(comment.id) || comment.id <= cutoff || !comment.user?.login
                        || comment.user.login.toLowerCase() === context.trustedBotLogin.toLowerCase()
                        || !comment.body || !parseSddAnswer(comment.body, question.id)) continue;
                    if (await this.authorized(context, question.owner, comment.user.login, authorizations)) { answered = true; break; }
                }
            }
            if (!answered) pending.push(question.id);
        }
        return pending;
    }

    private async authorized(context: SddEvidenceQueryContext, owner: 'issue-author' | 'maintainer', author: string,
        authorizations: Map<string, Promise<boolean>>): Promise<boolean> {
        if (owner === 'issue-author') return Boolean(context.issueAuthor && author.toLowerCase() === context.issueAuthor.toLowerCase());
        const key = author.toLowerCase();
        let authorization = authorizations.get(key);
        if (!authorization) {
            if (authorizations.size >= MAX_AUTHORIZATION_LOOKUPS) throw new Error('SDD authorization inventory exceeds its bound.');
            authorization = this.ports.actors.isActorAllowedToModifyFiles(author);
            authorizations.set(key, authorization);
        }
        return authorization;
    }

    private async fence(context: SddEvidenceQueryContext, original: ReadFacts, cardBody: string, cardId: number, record: SddGateRecord, verified?: VerifiedSddEvidence): Promise<boolean> {
        const fresh = await this.readFacts(context.issueNumber);
        const card = selectOwnedSddCard(fresh.comments, context.issueNumber, context.trustedBotLogin);
        if (card.state !== 'valid' || card.id !== cardId || card.body !== cardBody
            || this.digest(context, fresh, record.baseSha) !== this.digest(context, original, record.baseSha)
            || canonicalLabels(fresh.labels) !== canonicalLabels(original.labels)
            || !this.required(context, fresh.labels)) return false;
        // Answer arrivals or edits must not let a stale question projection become current.
        if (record.phase === 'awaiting-answer'
            && JSON.stringify(fresh.comments) !== JSON.stringify(original.comments)) return false;
        if (record.branchName) {
            const linked = await this.ports.branches.getLinkedBranch(context.issueNumber, record.branchName);
            if (linked?.name !== record.branchName || linked.headSha !== (verified?.branchHeadSha ?? record.baseSha)) return false;
            if (verified && (!await this.ports.workspace.verifyPublication(record.branchName, record.baseSha, record.commitSha!, record.plan.path)
                || (record.phase === 'published' && record.revisionSha
                    && !await this.ports.workspace.verifyPublication(record.branchName, record.revisionBaseSha!, record.revisionSha, record.plan.path)))) return false;
        } else if (!context.baseBranch || (await this.ports.workspace.loadSnapshot(context.baseBranch)).baseSha !== record.baseSha) return false;
        return true;
    }

    private required(context: SddEvidenceQueryContext, labels: readonly string[]): boolean {
        return decideIssueStart({ kind: context.admittedKind, labels,
            issueManagedBranches: context.issueManagedBranches!, preBranchSdd: context.preBranchSdd! }).sddRequired;
    }

    private digest(context: SddEvidenceQueryContext, facts: ReadFacts, baseSha: string): string {
        return buildSddIssueDigest({ issueNumber: context.issueNumber, issueTitle: facts.title, issueBody: facts.body,
            admittedKind: context.admittedKind!, profileDigest: context.profileDigest }, baseSha);
    }

    private async readFacts(issueNumber: number): Promise<ReadFacts> {
        const [title, body, labels, comments] = await Promise.all([
            this.ports.titles.getTitle(issueNumber), this.ports.descriptions.getDescription(issueNumber),
            this.ports.labels.getLabels(issueNumber), this.ports.comments.listIssueComments(issueNumber),
        ]);
        if (title === undefined || body === undefined || comments.coverage.source !== 'issue-comments'
            || comments.coverage.status !== 'complete' || comments.coverage.limitReached || comments.coverage.providerLimitReached
            || comments.coverage.omittedItems !== 0 || comments.coverage.truncatedItems !== 0) throw new Error('Incomplete SDD authority.');
        return { title, body, labels, comments: comments.value };
    }
}

function ownedAt(snapshot: SddCatalogSnapshot, sha: string, record: SddGateRecord): boolean {
    if (!Array.isArray(snapshot.capabilities) || snapshot.capabilities.some(capability => !capability || typeof capability.id !== 'string'
        || !Array.isArray(capability.specs) || capability.specs.some((path: unknown) => typeof path !== 'string'))
        || new Set(snapshot.capabilities.map(capability => capability.id)).size !== snapshot.capabilities.length) return false;
    const owners = snapshot.capabilities.filter(capability => capability.specs.includes(record.plan.path));
    return snapshot.baseSha === sha && owners.length === 1 && owners[0].id === record.plan.capabilityId;
}

function fullSha(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value); }
function canonicalLabels(labels: readonly string[]): string { return JSON.stringify([...new Set(labels.map(label => label.trim().toLowerCase()))].sort()); }
