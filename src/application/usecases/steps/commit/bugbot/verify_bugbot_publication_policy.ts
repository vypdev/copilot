import type { BugbotShadowCitation } from '../../../../ports/bugbot_shadow_verification_ports';
import { bugbotResolutionCandidateId } from '../../../../../domain/bugbot/finding';
import type { PreparedBugbotFindings } from './prepare_bugbot_findings';
import type { BugbotShadowVerificationReport } from './observe_bugbot_shadow_verification';
import { applyCommentLimit } from './limit_comments';

export type BugbotVerificationProjection =
    | { readonly status: 'invalid' }
    | {
        readonly status: 'complete' | 'incomplete';
        readonly prepared: PreparedBugbotFindings;
        readonly inconclusive: readonly { readonly id: string; readonly missing: string }[];
    };

function describeCitation(citation: BugbotShadowCitation): string {
    const range = citation.first === citation.last ? String(citation.first) : `${citation.first}–${citation.last}`;
    if (citation.kind === 'git') return `${citation.path}:${range} (${citation.sha})`;
    if (citation.url) return `${citation.url} (lines ${range})`;
    return `${citation.kind} evidence (${citation.sha})`;
}

/** Decides the complete batch before any mutation, including overflow and proposed history changes. */
export function projectVerifiedBugbotPublication(
    prepared: PreparedBugbotFindings,
    report: BugbotShadowVerificationReport,
    commentLimit: number,
): BugbotVerificationProjection {
    const active = prepared.activeFindings ?? prepared.toPublish;
    const observations = new Map(report.candidates.map(result => [result.id, result]));
    const expected = [...active.map(finding => finding.id), ...[...prepared.resolvedFindingIds].map(bugbotResolutionCandidateId)];
    if (report.detectionUnavailable || report.superseded || observations.size !== expected.length
        || observations.size !== report.candidates.length || new Set(expected).size !== expected.length) return { status: 'invalid' };
    const inconclusive: Array<{ id: string; missing: string }> = [];
    const confirmed = new Map<string, Extract<BugbotShadowVerificationReport['candidates'][number], { status: 'verdict' }>>();
    for (const id of expected) {
        const observation = observations.get(id);
        if (!observation || observation.status !== 'verdict') return { status: 'invalid' };
        if (observation.verdict === 'inconclusive') {
            if (!observation.missing?.trim()) return { status: 'invalid' };
            inconclusive.push({ id, missing: observation.missing });
            continue;
        }
        if (observation.verdict !== 'confirmed' && observation.verdict !== 'refuted') return { status: 'invalid' };
        if (!observation.candidate || observation.candidate.id !== id || !observation.citations.length) return { status: 'invalid' };
        if (!observation.citations.some(citation => citation.kind === 'git' && citation.sha === observation.candidate?.headSha)) {
            inconclusive.push({ id, missing: 'The verdict requires repository evidence on the reviewed head.' });
            continue;
        }
        if (observation.verdict === 'confirmed') confirmed.set(id, observation);
    }
    const findings = active.flatMap(finding => {
        const verdict = confirmed.get(finding.id);
        if (!verdict) return [];
        const { suggestedCode: _suggestedCode, suggestion: _suggestion, evidence: _evidence, ...verified } = finding;
        return [{ ...verified, description: verdict.reason, evidence: verdict.citations.map(describeCitation).join('\n') }];
    });
    const resolvedFindingIds = new Set([...prepared.resolvedFindingIds].filter(id => confirmed.has(bugbotResolutionCandidateId(id))));
    return {
        status: inconclusive.length ? 'incomplete' : 'complete',
        prepared: {
            ...applyCommentLimit(findings, commentLimit),
            activeFindings: findings,
            resolvedFindingIds,
            resolvedFindingResolutions: new Map([...prepared.resolvedFindingResolutions ?? []]
                .filter(([id]) => resolvedFindingIds.has(id))),
        },
        inconclusive,
    };
}
