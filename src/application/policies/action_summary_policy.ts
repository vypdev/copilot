import { getResultPayload, type Result } from '../../data/model/result';
import { sanitizeAgentMarkdown, sanitizePublishedError } from './github_comment_publication_policy';
import { buildApplicationErrorPresentation } from './application_error_presentation_policy';

export interface ActionSummaryContext {
    readonly owner: string;
    readonly repository: string;
    readonly eventName: string;
    readonly issueNumber: number;
    readonly pullRequestNumber: number;
    readonly lifecycleState?: string;
    readonly pullRequestDescriptionMode?: string;
    readonly failOnUnresolvedFindings?: boolean;
    readonly results: readonly Result[];
}

/** Builds a bounded, publication-safe GitHub Actions Job Summary. */
export function buildActionSummary(context: ActionSummaryContext): string {
    const failures = context.results.filter(result => !result.success && result.executed);
    const findingStates = aggregateFindingStateCounts(context.results);
    const bugbotTelemetry = context.results.map(result => getBugbotTelemetry(result.payload)).find(Boolean);
    const hasActionableFindings = (findingStates?.open ?? 0)
        + (findingStates?.reopened ?? 0)
        + (findingStates?.['verification-required'] ?? 0) > 0;
    const hasUnknownFindings = (findingStates?.unknown ?? 0) > 0;
    const status = failures.length > 0 || hasUnknownFindings || (hasActionableFindings && context.failOnUnresolvedFindings)
        ? '❌ Failure'
        : hasActionableFindings
            ? '⚠️ Findings'
            : '✅ Success';
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
        `| PR description policy | ${escapeTable(context.pullRequestDescriptionMode ?? '—')} |`,
        `| Results | ${context.results.length} |`,
        `| Finding states | ${formatFindingStates(findingStates)} |`,
        `| Bugbot review | ${formatBugbotTelemetry(bugbotTelemetry)} |`,
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

function getBugbotTelemetry(value: unknown): { outcome: string; elapsedMs: number; configuredEffort: string } | undefined {
    const telemetry = getResultPayload(getResultPayload(value)?.bugbotTelemetry);
    if (!telemetry || typeof telemetry.outcome !== 'string' || typeof telemetry.elapsedMs !== 'number') return undefined;
    return {
        outcome: telemetry.outcome,
        elapsedMs: telemetry.elapsedMs,
        configuredEffort: typeof telemetry.configuredEffort === 'string' ? telemetry.configuredEffort : 'default',
    };
}

function formatBugbotTelemetry(telemetry: ReturnType<typeof getBugbotTelemetry>): string {
    return telemetry
        ? `${escapeTable(telemetry.outcome)}, effort=${escapeTable(telemetry.configuredEffort)}, ${Math.max(0, Math.round(telemetry.elapsedMs))}ms`
        : '—';
}

type FindingStateCounts = {
    open: number;
    reopened: number;
    fixed: number;
    obsolete: number;
    dismissed: number;
    'verification-required': number;
    unknown: number;
};

function getFindingStateCounts(value: unknown): FindingStateCounts | undefined {
    const payload = getResultPayload(value);
    const stateCounts = getResultPayload(payload?.findingStates) as Partial<Record<keyof FindingStateCounts, unknown>> | undefined;
    if (!stateCounts) return undefined;
    const establishedStates = ['open', 'reopened', 'fixed', 'obsolete', 'dismissed'] as const;
    if (!establishedStates.every(state => typeof stateCounts[state] === 'number')) return undefined;
    return {
        ...Object.fromEntries(establishedStates.map(state => [state, stateCounts[state]])),
        'verification-required': typeof stateCounts['verification-required'] === 'number'
            ? stateCounts['verification-required']
            : 0,
        unknown: typeof stateCounts.unknown === 'number' ? stateCounts.unknown : 0,
    } as FindingStateCounts;
}

function aggregateFindingStateCounts(results: readonly Result[]): ReturnType<typeof getFindingStateCounts> {
    const counts = results.map(result => getFindingStateCounts(result.payload)).filter((value): value is NonNullable<ReturnType<typeof getFindingStateCounts>> => value !== undefined);
    if (counts.length === 0) return undefined;
    return counts.reduce((total, current) => ({
        open: total.open + current.open,
        reopened: total.reopened + current.reopened,
        fixed: total.fixed + current.fixed,
        obsolete: total.obsolete + current.obsolete,
        dismissed: total.dismissed + current.dismissed,
        'verification-required': total['verification-required'] + current['verification-required'],
        unknown: total.unknown + current.unknown,
    }), {
        open: 0,
        reopened: 0,
        fixed: 0,
        obsolete: 0,
        dismissed: 0,
        'verification-required': 0,
        unknown: 0,
    });
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
            .flatMap((error) => {
                const view = buildApplicationErrorPresentation(error);
                return [
                    `  - **Impact:** ${sanitizePublishedError(view.impact)}`,
                    `    - **Cause (\`${view.code}\`):** ${sanitizePublishedError(view.cause)}`,
                    `    - **Action:** ${sanitizePublishedError(view.action)}`,
                    `    - **Retained state:** ${sanitizePublishedError(view.retainedState)}`,
                    `    - **Reference:** \`${view.reference}\``,
                ];
            });
        return [`- ${icon} **${escapeTable(result.id || 'Unnamed result')}**`, ...details, ...errors].join('\n');
    }).join('\n');
}

function escapeTable(value: string): string {
    return String(value ?? '').replace(/[|\r\n]/g, match => match === '|' ? '\\|' : ' ');
}
