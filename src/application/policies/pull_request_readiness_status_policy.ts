import type { PullRequestReadinessSnapshot } from './pull_request_readiness_policy';

interface ReadinessPresentationSnapshot {
    readonly owner: string;
    readonly repository: string;
    readonly serverOrigin?: string;
    readonly pullRequestReadiness?: PullRequestReadinessSnapshot;
}
import type { PublicationMessageCatalog, PublicationMessageId } from './publication_message_catalog';

/** Append exact-head facts and bound the entire combined status, including independent SDD sections. */
export function appendPullRequestReadiness(baseLines: readonly string[], snapshot: ReadinessPresentationSnapshot, catalog: PublicationMessageCatalog): string {
    const lines = [...baseLines];
    if (snapshot.pullRequestReadiness) {
        const readiness = snapshot.pullRequestReadiness;
        const states = ['unavailable', 'pending', 'blocked', 'satisfied', 'not-applicable'];
        const renderState = (state: string) => catalog.render(`interaction.status.prReadiness.${states.includes(state) ? state : 'unavailable'}` as PublicationMessageId);
        const mode = ['off', 'recommend', 'guarded', 'unavailable'].includes(readiness.mode) ? readiness.mode : 'unavailable';
        const head = /^[a-f0-9]{40}$/u.test(readiness.headSha) ? readiness.headSha.slice(0, 8) : catalog.render('interaction.status.notSet');
        const code = /^[a-z0-9-]{1,60}$/u.test(readiness.code) ? readiness.code : 'evidence-unavailable';
        lines.push(`- **${catalog.render('interaction.status.prReadiness')}:** ${renderState(readiness.readiness)} (${mode}; ${catalog.render('interaction.status.prReadiness.revision')} ${head}; ${code})`);
        if (readiness.evidence) for (const group of ['ci', 'coverage', 'bugbot', 'reviews'] as const) {
            lines.push(`- **${catalog.render(`interaction.status.prReadiness.${group}`)}:** ${renderState(readiness.evidence[group])}`);
        }
        const url = verifiedReadinessLink(snapshot, readiness.pullNumber);
        if (url) lines.push(`[${catalog.render('interaction.status.prReadiness.openPr')}](${url})`);
        if (readiness.humanReviewRequired && readiness.readiness === 'satisfied' && mode === 'recommend') {
            lines.push(catalog.render('interaction.status.prReadiness.humanReview'));
        }
        const actions = ['retry', 'wait', 'resolve', 'human-review', 'observer', 'select-pr', 'none'];
        const action = readiness.action && actions.includes(readiness.action) ? readiness.action : 'retry';
        if (action !== 'none') lines.push(`${catalog.render('interaction.status.prReadiness.next')}: ${catalog.render(`interaction.status.prReadiness.action.${action}` as PublicationMessageId)}`);
    }
    const rendered = lines.join('\n');
    return snapshot.pullRequestReadiness && rendered.length > 6_000
        ? `${catalog.render('interaction.status.prReadiness.oversize')}\n${catalog.render('interaction.status.prReadiness.action.retry')}` : rendered;
}

function verifiedReadinessLink(snapshot: ReadinessPresentationSnapshot, number: number | undefined): string | undefined {
    if (!Number.isSafeInteger(number) || !number || number <= 0 || !/^[A-Za-z0-9_.-]+$/u.test(snapshot.owner)
        || !/^[A-Za-z0-9_.-]+$/u.test(snapshot.repository) || [snapshot.owner, snapshot.repository].some(value => value === '.' || value === '..')) return undefined;
    try {
        const url = new URL(snapshot.serverOrigin ?? '');
        return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
            ? `${url.origin}/${snapshot.owner}/${snapshot.repository}/pull/${number}` : undefined;
    } catch { return undefined; }
}
