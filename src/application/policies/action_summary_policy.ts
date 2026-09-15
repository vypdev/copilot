import type { Result } from '../../data/model/result';
import { sanitizeAgentMarkdown } from './github_comment_publication_policy';
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
import {
    resolveStaticActionSummaryCatalog,
    type ActionSummaryFindingState,
    type ActionSummaryMessageCatalog,
} from './action_summary_message_catalog';
import { buildApplicationErrorPresentation } from './application_error_presentation_policy';
import type { ApplicationErrorMessageReader } from './application_error_message_catalog';
import { hasStaleSourcePublicationOutcome } from './publication_outcome_policy';

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

/** Builds one bounded, publication-safe, repository-locale GitHub Actions Job Summary. */
export function buildActionSummary(
    context: ActionSummaryContext,
    catalog: ActionSummaryMessageCatalog = resolveStaticActionSummaryCatalog(context.locale?.repository ?? 'en-US'),
): string {
    const failures = context.results.filter(resultFailed);
    const findingStateProjection = projectBugbotResultFindingStates(context.results);
    const findingStates = findingStateProjection.status === 'valid' ? findingStateProjection.counts : undefined;
    const telemetryProjection = projectBugbotResultTelemetry(context.results);
    const bugbotTelemetry = telemetryProjection.status === 'valid' ? telemetryProjection.telemetry : undefined;
    const staleSourceSuppressed = hasStaleSourcePublicationOutcome(context.results);
    const hasActionableFindings = findingStates ? countActionableBugbotFindings(findingStates) > 0 : false;
    const hasUnknownFindings = findingStateProjection.status === 'invalid' || (findingStates?.unknown ?? 0) > 0;
    const status = resolveActionSummaryStatus({
        failureCount: failures.length,
        hasUnknownFindings,
        hasActionableFindings,
        failOnUnresolvedFindings: context.failOnUnresolvedFindings === true,
        bugbotTelemetry,
        allResultsSkipped: context.results.length > 0 && context.results.every(result => !result.executed),
    }, catalog);
    const target = resolveActionSummaryTarget(context, catalog);
    const lifecycle = context.lifecycleState ? `\`${sanitizeAgentMarkdown(context.lifecycleState, 100)}\`` : '—';
    const rows = [
        `| ${catalogText(catalog, 'summary.status')} | ${status} |`,
        `| ${catalogText(catalog, 'summary.event')} | \`${escapeTable(context.eventName)}\` |`,
        `| ${catalogText(catalog, 'summary.target')} | ${escapeTable(target)} |`,
        `| ${catalogText(catalog, 'summary.lifecycle')} | ${lifecycle} |`,
        `| ${catalogText(catalog, 'summary.descriptionPolicy')} | ${escapeTable(context.pullRequestDescriptionMode ?? '—')} |`,
        `| ${catalogText(catalog, 'summary.results')} | ${formatResultCounts(context.results, catalog)} |`,
        `| ${catalogText(catalog, 'summary.findingStates')} | ${formatFindingStates(findingStateProjection, catalog)} |`,
        `| ${catalogText(catalog, 'summary.bugbotReview')} | ${formatBugbotTelemetry(telemetryProjection, catalog)} |`,
        ...(staleSourceSuppressed ? [
            `| ${catalogText(catalog, 'summary.sourceFreshness')} | ${catalogText(catalog, 'summary.staleSourceSuppressed')} |`,
        ] : []),
    ];
    const localization = renderLocalizationSummarySection(
        context.locale,
        context.catalogResolutions,
        actionSummaryLocalizationLabels(catalog),
    );

    return [
        `# ${catalogText(catalog, 'summary.heading')}`,
        '',
        `${catalogText(catalog, 'summary.repository')}: [${escapeTable(`${context.owner}/${context.repository}`)}](https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)})`,
        '',
        `| ${catalogText(catalog, 'summary.property')} | ${catalogText(catalog, 'summary.value')} |`,
        '| --- | --- |',
        ...rows,
        ...(failures.length > 0 ? [
            '',
            `## ${catalogText(catalog, 'summary.resultDetails')}`,
            '',
            renderFailures(failures, catalog),
        ] : []),
        ...(localization ? ['', localization] : []),
    ].join('\n');
}

export function actionSummaryLocalizationLabels(catalog: ActionSummaryMessageCatalog): LocalizationSummaryLabels {
    return Object.freeze({
        heading: catalog.message('summary.localization'),
        property: catalog.message('summary.property'),
        value: catalog.message('summary.value'),
        repositoryLocale: catalog.message('summary.repositoryLocale'),
        issueLocale: catalog.message('summary.issueLocale'),
        pullRequestLocale: catalog.message('summary.pullRequestLocale'),
        catalogResolution: catalog.message('summary.catalogResolution'),
        descriptors: catalog.message('summary.descriptors'),
        reason: catalog.message('summary.reason'),
    });
}

/** Renders the same content-free locale evidence for summaries owned by specialized workflows. */
export function renderLocalizationSummarySection(
    locale: ActionSummaryContext['locale'],
    catalogResolutions: ActionSummaryContext['catalogResolutions'] = [],
    labels: LocalizationSummaryLabels = ENGLISH_LOCALIZATION_SUMMARY_LABELS,
): string {
    const safeLabels = sanitizeLocalizationSummaryLabels(labels);
    const rows = localizationSummaryRows(locale, catalogResolutions, safeLabels);
    if (rows.length === 0) return '';
    return [
        `## ${safeLabels.heading}`,
        '',
        `| ${safeLabels.property} | ${safeLabels.value} |`,
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
    readonly allResultsSkipped: boolean;
}

function resolveActionSummaryStatus(input: ActionSummaryStatusInput, catalog: ActionSummaryMessageCatalog): string {
    if (input.failureCount > 0 || input.hasUnknownFindings) return `❌ ${catalogText(catalog, 'summary.failure')}`;
    if (input.bugbotTelemetry?.outcome === 'failed') return `❌ ${catalogText(catalog, 'summary.failure')}`;
    if (input.hasActionableFindings && input.failOnUnresolvedFindings) return `❌ ${catalogText(catalog, 'summary.failure')}`;
    if (input.hasActionableFindings) return `⚠️ ${catalogText(catalog, 'summary.findings')}`;
    if (input.allResultsSkipped) return `⏭️ ${catalogText(catalog, 'summary.skipped')}`;
    switch (input.bugbotTelemetry?.outcome) {
        case 'partial': return `⚠️ ${catalogText(catalog, 'summary.partial')}`;
        case 'superseded': return `⏭️ ${catalogText(catalog, 'summary.superseded')}`;
        case 'skipped': return `⏭️ ${catalogText(catalog, 'summary.skipped')}`;
        case 'dry-run': return `🧪 ${catalogText(catalog, 'summary.dryRun')}`;
        default: return `✅ ${catalogText(catalog, 'summary.success')}`;
    }
}

function resolveActionSummaryTarget(context: ActionSummaryContext, catalog: ActionSummaryMessageCatalog): string {
    if (context.pullRequestNumber > 0) {
        return catalogText(catalog, 'summary.target.pullRequest', { number: context.pullRequestNumber });
    }
    if (context.issueNumber > 0) return catalogText(catalog, 'summary.target.issue', { number: context.issueNumber });
    return catalogText(catalog, 'summary.target.repositoryRun');
}

function formatBugbotTelemetry(
    projection: BugbotResultTelemetryProjection,
    catalog: ActionSummaryMessageCatalog,
): string {
    if (projection.status === 'invalid') return catalogText(catalog, 'summary.invalid');
    if (projection.status === 'absent') return '—';
    return catalogText(catalog, 'summary.bugbotTelemetry', {
        outcome: escapeTable(projection.telemetry.outcome),
        effort: escapeTable(projection.telemetry.configuredEffort),
        elapsed: Math.max(0, Math.round(projection.telemetry.elapsedMs)),
    });
}

function formatFindingStates(
    projection: BugbotResultFindingStateProjection,
    catalog: ActionSummaryMessageCatalog,
): string {
    if (projection.status === 'invalid') return catalogText(catalog, 'summary.invalid');
    if (projection.status === 'absent') return '—';
    return Object.entries(projection.counts)
        .filter(([, value]) => value > 0)
        .map(([state, value]) => `${catalogText(catalog, `summary.findingState.${state as ActionSummaryFindingState}`)}=${value}`)
        .join(', ') || catalogText(catalog, 'summary.none');
}

function formatResultCounts(results: readonly Result[], catalog: ActionSummaryMessageCatalog): string {
    const counts = results.reduce((current, result) => {
        if (resultFailed(result)) current.failed += 1;
        else if (!result.executed) current.skipped += 1;
        else current.succeeded += 1;
        return current;
    }, { succeeded: 0, failed: 0, skipped: 0 });
    return [
        `${catalogText(catalog, 'summary.resultSucceeded')}: ${counts.succeeded}`,
        `${catalogText(catalog, 'summary.resultFailed')}: ${counts.failed}`,
        `${catalogText(catalog, 'summary.resultSkipped')}: ${counts.skipped}`,
    ].join(' · ');
}

function resultFailed(result: Result): boolean {
    return result.errors.length > 0 || (!result.success && result.executed);
}

function renderFailures(results: readonly Result[], catalog: ActionSummaryMessageCatalog): string {
    const message: ApplicationErrorMessageReader = (id, variables) => catalogText(catalog, id, variables);
    return results.map(result => {
        const errors = result.errors
            .flatMap((error) => {
                const view = buildApplicationErrorPresentation(error, message);
                return [
                    `  - **${message('error.label.impact')}:** ${view.impact}`,
                    `    - **${message('error.label.errorCode')}:** \`${view.code}\``,
                    `    - **${message('error.label.action')}:** ${view.action}`,
                    `    - **${message('error.label.retainedState')}:** ${view.retainedState}`,
                    `    - **${message('error.label.retryable')}:** ${view.retryable}`,
                    `    - **${message('error.label.reference')}:** \`${view.reference}\``,
                ];
            });
        return [
            `- ❌ **${catalogText(catalog, 'summary.resultFailed')}**`,
            ...errors,
        ].join('\n');
    }).join('\n');
}

function catalogText(
    catalog: ActionSummaryMessageCatalog,
    id: Parameters<ActionSummaryMessageCatalog['message']>[0],
    variables: Readonly<Record<string, string | number>> = {},
): string {
    return escapeMarkdownText(catalog.message(id, variables));
}

function sanitizeLocalizationSummaryLabels(labels: LocalizationSummaryLabels): LocalizationSummaryLabels {
    return Object.freeze(Object.fromEntries(
        Object.entries(labels).map(([key, value]) => [key, escapeMarkdownText(value)]),
    ) as unknown as LocalizationSummaryLabels);
}

/** Catalog output is untrusted prose; renderers alone own Markdown structure. */
function escapeMarkdownText(value: string): string {
    return value.slice(0, 2_000)
        .replace(/[\r\n]+/gu, ' ')
        .replace(/<!--/gu, '&lt;!--')
        .replace(/-->/gu, '--&gt;')
        .replace(/::/gu, ':\u200b:')
        .replace(/@(?=[a-zA-Z0-9][a-zA-Z0-9-])/gu, '@\u200b')
        .replace(/\b(https?):\/\//giu, '$1:\u200b//')
        .replace(/\\/gu, '\\\\')
        .replace(/([`*_[\]<>|~])/gu, '\\$1');
}

function escapeTable(value: string): string {
    return String(value ?? '').replace(/[|\r\n]/g, match => match === '|' ? '\\|' : ' ');
}
