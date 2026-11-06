import { getResultPayload, type Result } from '../../data/model/result';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import type { StatusPublicationIntent } from '../../domain/github_publication';
import { githubUsersMatch } from '../../domain/github_user_policy';
import { parsePositiveSafeInteger } from '../../domain/positive_integer_policy';
import { STAGED_ROLLOUT_HOLD_REASONS } from '../../domain/staged_rollout';
import type { IssueCommentPublicationTarget } from '../ports/issue_lifecycle_ports';
import { buildPublicationMarker, createSemanticDigest, parsePublicationMarker } from './publication_identity_policy';

export const STAGED_ROLLOUT_RESULT = 'StagedRolloutAfterMerge';

export interface StagedRolloutCardProjection {
    readonly kind: 'staged-rollout';
    readonly pullNumber: number;
    readonly repositoryUrl: string;
    readonly headSha: string;
    readonly reviewId: string;
}

function spanish(locale: string): boolean {
    return /^es(?:-|$)/iu.test(locale);
}

export function renderStagedRolloutCard(intent: StatusPublicationIntent<StagedRolloutCardProjection>): string {
    const { pullNumber, repositoryUrl, headSha, reviewId } = intent.projection;
    const pull = `[PR #${pullNumber}](${repositoryUrl}/pull/${pullNumber})`;
    const review = `[GitHub review](${repositoryUrl}/pull/${pullNumber}#pullrequestreview-${reviewId})`;
    const content = spanish(intent.locale)
        ? ['## Rollout pendiente', '', `El PR preparatorio ${pull} se fusionó. La aceptación operativa sigue pendiente.`, '',
            '**Próximo paso** Completa la lista de aceptación de esta issue y registra la evidencia para que un mantenedor la revise antes del cierre.']
        : ['## Rollout pending', '', `Preparatory ${pull} merged. Operational acceptance is pending.`, '',
            '**Next step** Complete this issue’s acceptance checklist and record the evidence for a maintainer to review before closing.'];
    return [buildPublicationMarker(intent), '', ...content, '',
        `<details><summary>${spanish(intent.locale) ? 'Evidencia de la declaración' : 'Declaration evidence'}</summary>`,
        '', `${review} · \`${headSha}\``, '', '</details>'].join('\n');
}

function activeMarker(body: string | null | undefined, issueNumber: number) {
    const marker = parsePublicationMarker(body?.split('\n', 1)[0]);
    if (!marker || marker.identity.topic !== 'staged-rollout' || marker.identity.target.kind !== 'issue'
        || marker.identity.target.number !== issueNumber || !/^head:(?:[a-f\d]{40}|[a-f\d]{64}):review:[1-9]\d{0,19}$/u.test(marker.sourceVersion)) return;
    const pullNumber = parsePositiveSafeInteger(Number(/^pr:([1-9]\d*)$/u.exec(marker.identity.key)?.[1]));
    if (pullNumber) return { marker, pullNumber };
}

export function hasActiveStagedRolloutCard(
    comments: readonly IssueCommentPublicationTarget[],
    issueNumber: number,
    botLogin: string,
): boolean {
    return comments.some(comment => githubUsersMatch(comment.user?.login ?? '', botLogin) && activeMarker(comment.body, issueNumber));
}

export function retireStagedRolloutCard(body: string, issueNumber: number, locale: string, reason: string): string | undefined {
    const active = activeMarker(body, issueNumber);
    if (!active) return;
    const archive = body.slice(body.indexOf('\n') + 1).trim();
    const sourceVersion = `closed:${reason}:${active.marker.sourceVersion}`;
    const marker = buildPublicationMarker({
        identity: active.marker.identity, sourceVersion, digest: createSemanticDigest({ sourceVersion, archive }),
    });
    const heading = spanish(locale) ? 'Rollout archivado' : 'Rollout archived';
    const message = spanish(locale)
        ? 'GitHub registra esta issue como cerrada. La lista de aceptación y la evidencia siguen en la conversación.'
        : 'GitHub records this issue as closed. The acceptance checklist and evidence remain in the conversation.';
    const history = spanish(locale) ? 'Seguimiento antes del cierre' : 'Tracking before closure';
    return [marker, '', `## ${heading}`, '', message, '',
        `<details><summary>${history}</summary>`, '', archive.replace(/<\/?details>|<\/?summary>/gu, ''), '', '</details>'].join('\n');
}

export function stagedRolloutSummaryRows(
    results: readonly Result[],
    owner: string,
    repository: string,
    locale: string,
): string[] {
    const es = spanish(locale);
    const root = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    return results.flatMap(result => {
        if (result.id !== STAGED_ROLLOUT_RESULT) return [];
        const data = getResultPayload(result.payload);
        const issue = parsePositiveSafeInteger(data?.issueNumber);
        const pull = parsePositiveSafeInteger(data?.pullNumber);
        if (!issue || !pull) return [];
        const issueLink = `[Issue #${issue}](${root}/issues/${issue})`;
        const pullLink = `[PR #${pull}](${root}/pull/${pull})`;
        const head = canonicalGitObjectId(data?.headSha);
        const card = parsePositiveSafeInteger(data?.commentId);
        const details = `${issueLink} · ${pullLink}${head ? ` · \`${head}\`` : ''}${card
            ? ` · [${es ? 'Tarjeta de seguimiento' : 'Tracking card'}](${root}/issues/${issue}#issuecomment-${card})` : ''}`;
        const label = es ? 'Rollout por etapas' : 'Staged rollout';
        if (data?.state === 'pending') {
            return [`| ${label} | ${es ? 'Rollout pendiente. Completa la aceptación en la issue abierta.' : 'Rollout pending. Complete acceptance in the open issue.'} ${details} |`];
        }
        if (data?.state === 'registration-failed') {
            return [`| ${label} | ${es
                ? 'Falló el registro. El PR se fusionó y la aceptación sigue en la issue. Vuelve a ejecutar los jobs fallidos de esta ejecución.'
                : 'Registration failed. The PR merged and acceptance remains in the issue. Re-run failed jobs for this workflow run.'} ${details} |`];
        }
        if (data?.state !== 'held' || !STAGED_ROLLOUT_HOLD_REASONS.some(reason => reason === data.reason)) return [];
        const retry = data.reason === 'evidence-unavailable';
        return [`| ${label} | ${es ? 'Declaración bloqueada' : 'Declaration held'} (\`${data.reason}\`). ${retry
            ? es ? 'Restaura el acceso a la evidencia y vuelve a ejecutar los jobs fallidos de esta ejecución.' : 'Restore access to the evidence and re-run failed jobs for this workflow run.'
            : es ? 'Revisa la issue abierta y registra allí la aceptación antes de cerrarla.' : 'Review the open issue and record acceptance there before closing it.'} ${details} |`];
    });
}
