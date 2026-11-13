import { getResultPayload, type Result } from '../../data/model/result';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import { isProgressEvidencePath } from '../../domain/progress_evidence_path';
import { isProgressRequirementId } from '../../domain/progress_response_diagnostic';
import { escapeHtml, sanitizeAgentMarkdown } from './github_comment_publication_policy';
import { MAX_PROGRESS_ASSESSMENT_POINTS, MAX_PROGRESS_FACT_POINTS } from './progress_assessment_capacity_policy';

export interface ProgressWorkOutcome {
    readonly id: string;
    readonly status: 'supported' | 'missing' | 'verification-unknown';
    readonly remaining: string | null;
    readonly requirement?: string;
    readonly origin: 'issue' | 'draft';
    readonly evidencePath?: string;
}

export interface ProgressWorkAssessment {
    readonly headSha: string;
    readonly scopeDigest: string;
    readonly baseSha?: string;
    readonly pullNumber?: number;
    readonly sdd?: { readonly commitSha: string; readonly path: string };
    readonly outcomes: readonly ProgressWorkOutcome[];
}

export interface ProgressWorkLinks {
    readonly repositoryUrl: string;
    readonly issueNumber: number;
    readonly runUrl?: string;
}

/** An additive view of the complete same-head result. Legacy payloads keep their existing rendering. */
export function readProgressWorkAssessment(value: unknown, head: string, scope: string, progress: number): ProgressWorkAssessment | undefined {
    if (!value || typeof value !== 'object' || !Number.isFinite(progress) || progress < 0 || progress > 100) return undefined;
    const work = value as ProgressWorkAssessment;
    if (work.headSha !== head || canonicalGitObjectId(head) !== head || work.scopeDigest !== scope
        || !/^[a-f0-9]{64}$/u.test(scope) || !Array.isArray(work.outcomes)
        || work.outcomes.length < 1 || work.outcomes.length > 256
        || (work.pullNumber !== undefined && (!Number.isSafeInteger(work.pullNumber) || work.pullNumber < 1))) return undefined;
    if (work.baseSha !== undefined && canonicalGitObjectId(work.baseSha) !== work.baseSha) return undefined;
    if (work.sdd !== undefined && (!work.sdd || canonicalGitObjectId(work.sdd.commitSha) !== work.sdd.commitSha
        || !isProgressEvidencePath(work.sdd.path) || !work.sdd.path.startsWith('specs/'))) return undefined;
    const ids = new Set<string>();
    let remainingPoints = 0;
    for (const item of work.outcomes) {
        if (!item || !isProgressRequirementId(item.id) || ids.has(item.id)
            || (item.evidencePath !== undefined && !isProgressEvidencePath(item.evidencePath))
            || (item.requirement !== undefined && (typeof item.requirement !== 'string' || [...item.requirement].length > 180))
            || !['issue', 'draft'].includes(item.origin)) return undefined;
        ids.add(item.id);
        if (item.status === 'supported') {
            if (item.remaining !== null) return undefined;
        } else if (!['missing', 'verification-unknown'].includes(item.status)
            || typeof item.remaining !== 'string' || !item.remaining.trim()
            || [...item.remaining].length > MAX_PROGRESS_FACT_POINTS) {
            return undefined;
        } else {
            remainingPoints += [...item.remaining].length;
        }
    }
    if (remainingPoints > MAX_PROGRESS_ASSESSMENT_POINTS || (progress === 100) !== (remainingPoints === 0)) return undefined;
    return work;
}

/** Selects eligible typed workflow results before the generic Job Summary renders them. */
export function projectProgressWorkDetails(results: readonly Result[]) {
    return results.flatMap(result => {
        if (result.id !== 'CheckProgressUseCase' || !result.executed || !result.success) return [];
        const payload = getResultPayload(result.payload);
        if (!payload || typeof payload.progress !== 'number' || typeof payload.sourceHeadSha !== 'string'
            || typeof payload.scopeManifestDigest !== 'string' || typeof payload.issueNumber !== 'number'
            || !Number.isSafeInteger(payload.issueNumber) || payload.issueNumber < 1) return [];
        const assessment = readProgressWorkAssessment(payload.pendingWork, payload.sourceHeadSha, payload.scopeManifestDigest, payload.progress);
        if (!assessment || (assessment.baseSha && assessment.baseSha !== payload.baseSha)) return [];
        return [{ issueNumber: payload.issueNumber, progress: payload.progress, assessment }];
    });
}

const copy = {
    en: {
        estimate: 'estimated', head: 'Assessed head', supported: 'supported', missing: 'need implementation',
        unknown: 'need verification or clarification', implementation: 'Implementation still needed',
        verification: 'Verification or clarification needed', complete: 'All scoped requirements are supported.',
        more: 'more pending requirements', details: 'Full assessment', pull: 'Linked pull request', issue: 'Issue',
        unavailable: 'The full pending list is unavailable on this surface.',
        scope: 'Requirement source', evidence: 'Evidence at assessed head',
    },
    es: {
        estimate: 'estimado', head: 'Commit evaluado', supported: 'respaldados', missing: 'requieren implementación',
        unknown: 'requieren verificación o aclaración', implementation: 'Implementación pendiente',
        verification: 'Verificación o aclaración pendiente', complete: 'Todos los requisitos evaluados están respaldados.',
        more: 'requisitos pendientes adicionales', details: 'Evaluación completa', pull: 'Pull request vinculada', issue: 'Issue',
        unavailable: 'La lista completa de pendientes no está disponible aquí.',
        scope: 'Fuente del requisito', evidence: 'Evidencia en el commit evaluado',
    },
} as const;

export function renderProgressWorkAssessment(
    progress: number, assessment: ProgressWorkAssessment, locale: string, links: ProgressWorkLinks, full = false,
): string {
    const labels = /^es(?:-|$)/iu.test(locale) ? copy.es : copy.en;
    const missing = assessment.outcomes.filter(item => item.status === 'missing');
    const unknown = assessment.outcomes.filter(item => item.status === 'verification-unknown');
    const supported = assessment.outcomes.length - missing.length - unknown.length;
    const issue = `${links.repositoryUrl}/issues/${links.issueNumber}`;
    const blob = (sha: string, path: string) => `${links.repositoryUrl}/blob/${sha}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const inline = (text: string | null | undefined) => escapeHtml(sanitizeAgentMarkdown(text, 'complete').replace(/\s+/gu, ' ')).replace(/[[\]()`*_!\\]/gu, '\\$&')
        .replace(/https?:\/\//giu, match => match.replace('//', '/\u200b/'));
    const line = (item: ProgressWorkOutcome) => {
        const source = item.origin === 'draft' && assessment.sdd ? blob(assessment.sdd.commitSha, assessment.sdd.path) : issue;
        const action = inline(item.remaining);
        const requirement = item.requirement?.trim() && item.requirement.trim() !== item.remaining?.trim()
            ? `${inline(item.requirement)} — ` : '';
        const evidence = item.evidencePath ? ` · [${labels.evidence}](${blob(assessment.headSha, item.evidencePath)})` : '';
        return `- ${item.id} · ${requirement}${action} [${labels.scope}](${source})${evidence}`;
    };
    const count = missing.length + unknown.length;
    const fitsComment = !links.runUrl && [...missing, ...unknown].reduce((size, item) => size + line(item).length + 1, 0) < 48_000;
    const available = full || fitsComment ? count : 6;
    const missingShown = missing.slice(0, available - Number(unknown.length > 0));
    const unknownShown = unknown.slice(0, available - missingShown.length);
    const more = missing.length + unknown.length - missingShown.length - unknownShown.length;
    const destinations = [`[${labels.issue}](${issue})`,
        ...(assessment.pullNumber ? [`[${labels.pull}](${links.repositoryUrl}/pull/${assessment.pullNumber})`] : []),
        ...(links.runUrl ? [`[${labels.details}](${links.runUrl}#summary)`] : [])];
    return [
        `## ${/^es(?:-|$)/iu.test(locale) ? 'Progreso' : 'Progress'} · ${progress}% ${labels.estimate}`, '',
        `${labels.head} \`${assessment.headSha.slice(0, 8)}\` · ${supported}/${assessment.outcomes.length} ${labels.supported}`,
        ...(progress === 100 ? ['', labels.complete] : [`${missing.length} ${labels.missing} · ${unknown.length} ${labels.unknown}`]),
        ...(missingShown.length ? ['', `### ${labels.implementation}`, ...missingShown.map(line)] : []),
        ...(unknownShown.length ? ['', `### ${labels.verification}`, ...unknownShown.map(line)] : []),
        ...(more ? ['', `${more} ${labels.more}.`, ...(!links.runUrl ? [labels.unavailable] : [])] : []), '', destinations.join(' · '),
    ].join('\n');
}
