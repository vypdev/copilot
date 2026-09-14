import type { Result } from '../../data/model/result';
import { sanitizeAgentMarkdown, sanitizePublishedError } from './github_comment_publication_policy';
import { buildApplicationErrorPresentation } from './application_error_presentation_policy';
import {
    projectBugbotResultTelemetry,
    type BugbotResultTelemetryProjection,
    type BugbotTelemetryProjection,
} from './bugbot_telemetry_projection_policy';
import {
    projectBugbotResultFindingStates,
    type BugbotResultFindingStateProjection,
} from './bugbot_result_finding_state_projection_policy';
import { countActionableBugbotFindings } from '../../domain/bugbot/review_state';
import type { CatalogResolutionObservation } from '../../domain/message_catalog';

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
    readonly locale?: Readonly<{ repository: string; issue: string; pullRequest: string }>;
    readonly catalogResolutions?: readonly CatalogResolutionObservation[];
}

export interface LocalizationSummaryLabels {
    readonly heading: string;
    readonly property: string;
    readonly value: string;
    readonly repositoryLocale: string;
    readonly issueLocale: string;
    readonly pullRequestLocale: string;
    readonly catalogResolution: string;
    readonly descriptors: string;
    readonly reason: string;
}

const ENGLISH_LOCALIZATION_SUMMARY_LABELS: LocalizationSummaryLabels = Object.freeze({
    heading: 'Localization',
    property: 'Property',
    value: 'Value',
    repositoryLocale: 'Repository locale',
    issueLocale: 'Issue locale',
    pullRequestLocale: 'Pull-request locale',
    catalogResolution: 'Catalog resolution',
    descriptors: 'descriptors',
    reason: 'reason',
});

/** Builds a bounded, publication-safe GitHub Actions Job Summary. */
export function buildActionSummary(context: ActionSummaryContext): string {
    const failures = context.results.filter(result => !result.success && result.executed);
    const findingStateProjection = projectBugbotResultFindingStates(context.results);
    const findingStates = findingStateProjection.status === 'valid' ? findingStateProjection.counts : undefined;
    const telemetryProjection = projectBugbotResultTelemetry(context.results);
    const bugbotTelemetry = telemetryProjection.status === 'valid' ? telemetryProjection.telemetry : undefined;
    const hasActionableFindings = findingStates ? countActionableBugbotFindings(findingStates) > 0 : false;
    const hasUnknownFindings = findingStateProjection.status === 'invalid' || (findingStates?.unknown ?? 0) > 0;
    const status = resolveActionSummaryStatus({
        failureCount: failures.length,
        hasUnknownFindings,
        hasActionableFindings,
        failOnUnresolvedFindings: context.failOnUnresolvedFindings === true,
        bugbotTelemetry,
    });
    const target = resolveActionSummaryTarget(context);
    const lifecycle = context.lifecycleState ? `\`${sanitizeAgentMarkdown(context.lifecycleState, 100)}\`` : '—';
    const rows = [
        `| Status | ${status} |`,
        `| Event | \`${escapeTable(context.eventName)}\` |`,
        `| Target | ${escapeTable(target)} |`,
        `| Lifecycle | ${lifecycle} |`,
        `| PR description policy | ${escapeTable(context.pullRequestDescriptionMode ?? '—')} |`,
        `| Results | ${context.results.length} |`,
        `| Finding states | ${formatFindingStates(findingStateProjection)} |`,
        `| Bugbot review | ${formatBugbotTelemetry(telemetryProjection)} |`,
        ...localizationSummaryRows(context.locale, context.catalogResolutions),
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

/** Renders the same content-free locale evidence for summaries owned by specialized workflows. */
export function renderLocalizationSummarySection(
    locale: ActionSummaryContext['locale'],
    catalogResolutions: ActionSummaryContext['catalogResolutions'] = [],
    labels: LocalizationSummaryLabels = ENGLISH_LOCALIZATION_SUMMARY_LABELS,
): string {
    const rows = localizationSummaryRows(locale, catalogResolutions, labels);
    if (rows.length === 0) return '';
    return [
        `## ${labels.heading}`,
        '',
        `| ${labels.property} | ${labels.value} |`,
        '| --- | --- |',
        ...rows,
        '',
    ].join('\n');
}

function localizationSummaryRows(
    locale: ActionSummaryContext['locale'],
    catalogResolutions: ActionSummaryContext['catalogResolutions'] = [],
    labels: LocalizationSummaryLabels = ENGLISH_LOCALIZATION_SUMMARY_LABELS,
): string[] {
    return [
        ...(locale ? [
            `| ${labels.repositoryLocale} | \`${escapeTable(locale.repository)}\` |`,
            `| ${labels.issueLocale} | \`${escapeTable(locale.issue)}\` |`,
            `| ${labels.pullRequestLocale} | \`${escapeTable(locale.pullRequest)}\` |`,
        ] : []),
        ...(catalogResolutions.length ? [
            `| ${labels.catalogResolution} | ${formatCatalogResolutions(catalogResolutions, labels)} |`,
        ] : []),
    ];
}

function formatCatalogResolutions(
    observations: readonly CatalogResolutionObservation[],
    labels: LocalizationSummaryLabels,
): string {
    return observations.map(observation => {
        const fallback = observation.fallbackReason ? `, ${labels.reason}=${observation.fallbackReason}` : '';
        return `\`${escapeTable(observation.requestedLocale)} -> ${escapeTable(observation.resolvedLocale)} (${observation.source}, ${labels.descriptors}=${observation.descriptorCount}${fallback})\``;
    }).join('<br>');
}

interface ActionSummaryStatusInput {
    readonly failureCount: number;
    readonly hasUnknownFindings: boolean;
    readonly hasActionableFindings: boolean;
    readonly failOnUnresolvedFindings: boolean;
    readonly bugbotTelemetry?: BugbotTelemetryProjection;
}

function resolveActionSummaryStatus(input: ActionSummaryStatusInput): string {
    if (input.failureCount > 0 || input.hasUnknownFindings) return '❌ Failure';
    if (input.bugbotTelemetry?.outcome === 'failed') return '❌ Failure';
    if (input.hasActionableFindings && input.failOnUnresolvedFindings) return '❌ Failure';
    if (input.hasActionableFindings) return '⚠️ Findings';
    switch (input.bugbotTelemetry?.outcome) {
        case 'partial': return '⚠️ Partial';
        case 'superseded': return '⏭️ Superseded';
        case 'skipped': return '⏭️ Skipped';
        case 'dry-run': return '🧪 Dry run';
        default: return '✅ Success';
    }
}

function resolveActionSummaryTarget(context: ActionSummaryContext): string {
    if (context.pullRequestNumber > 0) return `PR #${context.pullRequestNumber}`;
    if (context.issueNumber > 0) return `Issue #${context.issueNumber}`;
    return 'Repository run';
}

function formatBugbotTelemetry(projection: BugbotResultTelemetryProjection): string {
    if (projection.status === 'invalid') return 'invalid';
    if (projection.status === 'absent') return '—';
    return `${escapeTable(projection.telemetry.outcome)}, effort=${escapeTable(projection.telemetry.configuredEffort)}, ${Math.max(0, Math.round(projection.telemetry.elapsedMs))}ms`;
}

function formatFindingStates(projection: BugbotResultFindingStateProjection): string {
    if (projection.status === 'invalid') return 'invalid';
    if (projection.status === 'absent') return '—';
    return Object.entries(projection.counts)
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
