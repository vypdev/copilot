import { decideIssueStart } from '../../domain/issue_start_policy';
import { isSafeSddPath } from '../../domain/pre_branch_sdd';
import type { SddEvidenceQueryContext } from '../ports/sdd_evidence_read_ports';
import type { SddEvidenceSnapshot } from '../ports/sdd_evidence_read_ports';
import type { PublicationMessageCatalog, PublicationMessageId } from './publication_message_catalog';

export interface SddStatusReadiness {
    readonly state: 'not-required' | 'unavailable' | 'unverified' | 'awaiting-answers' | 'publication-pending' | 'revision-pending' | 'ready';
    readonly required: boolean | null;
    readonly path?: string;
    readonly pendingQuestionIds?: readonly string[];
    readonly commitSha?: string;
    readonly firstCommitSha?: string;
    readonly cardId?: number;
}

/** Uses the admitted workflow/start policy; output labels cannot establish eligibility. */
export function initialSddStatus(context: Pick<SddEvidenceQueryContext, 'admittedKind' | 'issueManagedBranches' | 'preBranchSdd'>, labels: readonly string[]): SddStatusReadiness {
    if (!context.admittedKind || typeof context.issueManagedBranches !== 'boolean' || typeof context.preBranchSdd !== 'boolean') {
        return Object.freeze({ state: 'unavailable', required: null });
    }
    try {
        const required = decideIssueStart({ kind: context.admittedKind, labels, issueManagedBranches: context.issueManagedBranches, preBranchSdd: context.preBranchSdd }).sddRequired;
        return Object.freeze({ state: required ? 'unavailable' : 'not-required', required });
    } catch { return Object.freeze({ state: 'unavailable', required: null }); }
}

export function projectSddStatus(evidence: SddEvidenceSnapshot, initial?: SddStatusReadiness): SddStatusReadiness {
    const path = evidence.path ?? (evidence.state === 'stale' ? evidence.verified?.path : undefined);
    const firstCommitSha = evidence.verified?.path === path && /^[a-f0-9]{40}$/u.test(evidence.verified?.firstSha ?? '')
        ? evidence.verified!.firstSha : undefined;
    const revisionPending = (evidence.state === 'awaiting-answers' || evidence.state === 'publication-pending' || evidence.state === 'stale') && Boolean(firstCommitSha);
    const state: SddStatusReadiness['state'] = evidence.state === 'not-required' ? 'not-required'
        : evidence.state === 'absent' || evidence.state === 'unavailable' ? 'unavailable'
        : evidence.state === 'stale' ? (revisionPending ? 'revision-pending' : 'unverified') : evidence.state === 'invalid' ? 'unverified'
        : evidence.state === 'published' ? (evidence.verified?.path === evidence.path && /^[a-f0-9]{40}$/u.test(evidence.verified?.currentSha ?? '') ? 'ready' : 'unverified')
        : revisionPending ? 'revision-pending' : evidence.state;
    return Object.freeze({ state, required: state === 'not-required' ? false : state === 'unavailable' ? initial?.required ?? null : true,
        ...(path && !['not-required', 'unavailable', 'unverified'].includes(state) ? { path } : {}),
        ...((state === 'awaiting-answers' || state === 'revision-pending') && evidence.pendingQuestionIds ? { pendingQuestionIds: Object.freeze([...evidence.pendingQuestionIds]) } : {}),
        ...(state === 'ready' && evidence.verified?.currentSha ? { commitSha: evidence.verified.currentSha } : {}),
        ...((state === 'revision-pending' || state === 'ready') && firstCommitSha ? { firstCommitSha } : {}),
        ...(evidence.cardId ? { cardId: evidence.cardId } : {}),
    });
}

/** Receives only the closed projection, never question prose, record reasons or provider errors. */
export function formatSddStatus(readiness: SddStatusReadiness, catalog: PublicationMessageCatalog, issueUrl?: string, issueNumber?: number, identity?: { readonly owner: string; readonly repository: string; readonly serverOrigin?: string }): string[] {
    const path = readiness.path && isSafeSddPath(readiness.path) ? readiness.path : undefined;
    const commitSha = readiness.commitSha && /^[a-f0-9]{40}$/u.test(readiness.commitSha) ? readiness.commitSha : undefined;
    const firstCommitSha = readiness.firstCommitSha && /^[a-f0-9]{40}$/u.test(readiness.firstCommitSha) ? readiness.firstCommitSha : undefined;
    const pending = readiness.pendingQuestionIds?.filter(id => /^Q[1-8]$/u.test(id));
    const state = (readiness.state === 'ready' && (!path || !commitSha))
        || (readiness.state === 'revision-pending' && (!path || !firstCommitSha)) ? 'unverified' : readiness.state;
    const message: Record<SddStatusReadiness['state'], PublicationMessageId> = {
        'not-required': 'interaction.status.sddNotRequired', unavailable: 'interaction.status.sddUnavailable',
        unverified: 'interaction.status.sddUnverified', 'awaiting-answers': 'interaction.status.sddAwaitingAnswers',
        'publication-pending': 'interaction.status.sddPublicationPending', 'revision-pending': 'interaction.status.sddRevisionPending', ready: 'interaction.status.sddReady',
    };
    const next: Record<SddStatusReadiness['state'], PublicationMessageId | undefined> = {
        'not-required': undefined, unavailable: 'interaction.status.sddNextInspect', unverified: 'interaction.status.sddNextInspect',
        'awaiting-answers': 'interaction.status.sddNextAnswers', 'publication-pending': 'interaction.status.sddNextPublication',
        'revision-pending': pending?.length ? 'interaction.status.sddNextAnswers' : 'interaction.status.sddNextPublication', ready: 'interaction.status.sddNextReady',
    };
    const label = (id: PublicationMessageId, value: string) => `- **${catalog.render(id)}:** ${value}`;
    const lines = ['', `## ${catalog.render('interaction.status.sddHeading')}`,
        label('interaction.status.sddRequirement', catalog.render(readiness.required === null ? 'interaction.status.sddRequirementUnknown'
            : readiness.required ? 'interaction.status.sddRequired' : 'interaction.status.sddNotRequired')),
        label('interaction.status.sddState', catalog.render(message[state])),
    ];
    const base = safeIssueUrl(issueUrl, issueNumber, identity);
    if (path && !['unavailable', 'unverified'].includes(state)) lines.push(label('interaction.status.sddOwner', `\`${path}\``));
    if ((state === 'awaiting-answers' || state === 'revision-pending') && pending?.length) lines.push(label('interaction.status.sddQuestions', [...new Set(pending)].slice(0, 8).join(', ')));
    if (state === 'ready' && commitSha && path) {
        const evidence = base ? `[\`${commitSha}\`](${base.repository}/blob/${commitSha}/${path})` : `\`${commitSha}\``;
        lines.push(label('interaction.status.sddCommit', evidence));
    }
    if ((state === 'revision-pending' || (state === 'ready' && firstCommitSha !== commitSha)) && firstCommitSha && path) {
        const evidence = base ? `[\`${firstCommitSha}\`](${base.repository}/blob/${firstCommitSha}/${path})` : `\`${firstCommitSha}\``;
        lines.push(label('interaction.status.sddFirstCommit', evidence));
    }
    if (next[state]) lines.push('', catalog.render(next[state]!));
    if (base && Number.isSafeInteger(readiness.cardId) && readiness.cardId! > 0) lines.push(`[${catalog.render('interaction.status.sddCard')}](${base.issue}#issuecomment-${readiness.cardId})`);
    return lines;
}

function safeIssueUrl(value: string | undefined, issueNumber: number | undefined, identity: { readonly owner: string; readonly repository: string; readonly serverOrigin?: string } | undefined): { repository: string; issue: string } | undefined {
    if (!identity || !value || value.length > 2048 || !Number.isSafeInteger(issueNumber) || issueNumber! < 1) return undefined;
    try {
        const url = new URL(value);
        const server = new URL(identity.serverOrigin ?? 'https://github.com');
        if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash
            || server.pathname !== '/' || url.origin !== server.origin) return undefined;
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
            || !/^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/issues\/[1-9][0-9]*$/u.test(url.pathname)
            || url.pathname.toLowerCase() !== `/${identity.owner}/${identity.repository}/issues/${issueNumber}`.toLowerCase()) return undefined;
        return { repository: `${url.origin}${url.pathname.slice(0, url.pathname.lastIndexOf('/issues/'))}`, issue: url.href };
    } catch { return undefined; }
}
