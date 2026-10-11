import type { CopilotHistory } from './copilot_history_policy';
import type { PublicationMessageCatalog } from './publication_message_catalog';
export interface HistoryProjection extends CopilotHistory {
    readonly owner: string;
    readonly repository: string;
    readonly target: { readonly kind: 'issue' | 'pr'; readonly number: number };
    readonly serverOrigin: string;
}
/** Links come from a bound server/repository and validated IDs, never conversation URLs. */
export function renderCopilotHistory(view: HistoryProjection, catalog: PublicationMessageCatalog): string {
    const render = catalog.render;
    const origin = safeOrigin(view.serverOrigin);
    const identity = /^[A-Za-z0-9_.-]{1,100}$/u.test(view.owner) && /^[A-Za-z0-9_.-]{1,100}$/u.test(view.repository)
        && !['.', '..'].includes(view.owner) && !['.', '..'].includes(view.repository);
    const heading = `## ${render('interaction.history.heading')}`;
    const unavailable = `${heading}\n\n${render('interaction.history.unavailable')}`;
    if (!origin || !identity || view.state === 'unavailable') return unavailable;
    const root = `${origin}/${view.owner}/${view.repository}`;
    const target = `${root}/${view.target.kind === 'pr' ? 'pull' : 'issues'}/${view.target.number}`;
    const lines = [heading, '', render('interaction.history.scope'), '',
        ...(view.state === 'partial' ? [render('interaction.history.partial'), ''] : []),
        ...(view.rows.length ? [render('interaction.history.count', { count: view.rows.length }), '',
            `| ${render('interaction.history.operation')} | ${render('interaction.history.outcome')} | ${render('interaction.history.evidence')} |`,
            '|---|---|---|', ...view.rows.map(row => {
                const links = [`[${render('interaction.history.request')}](${target}#issuecomment-${row.sourceId})`,
                    ...(row.receiptId ? [`[${render('interaction.history.receipt')}](${target}#issuecomment-${row.receiptId})`] : []),
                    ...(row.commitSha ? [`[${render('interaction.history.commit')}](${root}/commit/${row.commitSha})`] : [])];
                return `| ${row.command} | ${render(row.outcome === 'unavailable' ? 'interaction.history.unavailableOutcome'
                    : row.outcome === 'partial' ? 'interaction.history.partialOutcome' : `interaction.history.${row.outcome}`)} | ${links.join(' · ')} |`;
            })] : [render('interaction.history.empty')])];
    const body = lines.join('\n');
    return body.length <= 5600 ? body : unavailable;
}
function safeOrigin(value: string): string | undefined {
    if (value.length > 200) return undefined;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password
        && url.pathname === '/' && !url.search && !url.hash ? url.origin : undefined; } catch { return undefined; }
}
