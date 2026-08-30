import { getResultPayload, type Result } from '../../data/model/result';
import { sanitizeAgentMarkdown, sanitizePublishedError } from './github_comment_publication_policy';

export interface ActionSummaryContext {
    readonly owner: string;
    readonly repository: string;
    readonly eventName: string;
    readonly issueNumber: number;
    readonly pullRequestNumber: number;
    readonly lifecycleState?: string;
    readonly results: readonly Result[];
}

/** Builds a bounded, publication-safe GitHub Actions Job Summary. */
export function buildActionSummary(context: ActionSummaryContext): string {
    const failures = context.results.filter(result => !result.success && result.executed);
    const findingStates = context.results
        .map(result => getFindingStateCounts(result.payload))
        .find(Boolean);
    const hasActionableFindings = (findingStates?.open ?? 0) + (findingStates?.reopened ?? 0) > 0;
    const status = failures.length === 0 && !hasActionableFindings ? '✅ Success' : '❌ Failure';
    const target = context.pullRequestNumber > 0
        ? `PR #${context.pullRequestNumber}`
        : context.issueNumber > 0
            ? `Issue #${context.issueNumber}`
            : 'Repository run';
    const lifecycle = context.lifecycleState ? `\`${sanitizeAgentMarkdown(context.lifecycleState, 100)}\`` : '—';
    const rows = [
        `| Status | ${status} |`,
        `| Event | \`${escapeTable(context.eventName)}\` |`,
        `| Target | ${escapeTable(target)} |`,
        `| Lifecycle | ${lifecycle} |`,
        `| Results | ${context.results.length} |`,
        `| Finding states | ${formatFindingStates(findingStates)} |`,
    ];

    return [
        '# Copilot execution',
        '',
        `Repository: [${escapeTable(`${context.owner}/${context.repository}`)}](https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)})`,
        '',
        '| Property | Value |',
        '| --- | --- |',
        ...rows,
        '',
        '## Result details',
        '',
        renderResults(context.results),
        '',
    ].join('\n');
}

function getFindingStateCounts(value: unknown): { open: number; reopened: number; fixed: number; obsolete: number; dismissed: number } | undefined {
    const payload = getResultPayload(value);
    const stateCounts = getResultPayload(payload?.findingStates) as Partial<Record<'open' | 'reopened' | 'fixed' | 'obsolete' | 'dismissed', unknown>> | undefined;
    if (!stateCounts) return undefined;
    const states = ['open', 'reopened', 'fixed', 'obsolete', 'dismissed'] as const;
    if (!states.every(state => typeof stateCounts[state] === 'number')) return undefined;
    return Object.fromEntries(states.map(state => [state, stateCounts[state]])) as { open: number; reopened: number; fixed: number; obsolete: number; dismissed: number };
}

function formatFindingStates(counts: ReturnType<typeof getFindingStateCounts>): string {
    if (!counts) return '—';
    return Object.entries(counts)
        .filter(([, value]) => value > 0)
        .map(([state, value]) => `${state}=${value}`)
        .join(', ') || 'none';
}

function renderResults(results: readonly Result[]): string {
    if (results.length === 0) return '_No application result was produced._';
    return results.map(result => {
        const icon = result.success ? '✅' : '❌';
        const details = result.steps
            .filter(step => step.trim())
            .map(step => `  - ${sanitizeAgentMarkdown(step, 1_000)}`);
        const errors = result.errors
            .map(error => `  - **Error:** ${sanitizePublishedError(error.message)}`);
        return [`- ${icon} **${escapeTable(result.id || 'Unnamed result')}**`, ...details, ...errors].join('\n');
    }).join('\n');
}

function escapeTable(value: string): string {
    return String(value ?? '').replace(/[|\r\n]/g, match => match === '|' ? '\\|' : ' ');
}
