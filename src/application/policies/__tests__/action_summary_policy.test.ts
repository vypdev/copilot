import { Result } from '../../../data/model/result';
import { buildActionSummary, renderLocalizationSummarySection } from '../action_summary_policy';
import { ApplicationError } from '../../errors/application_error';
import { resolveStaticActionSummaryCatalog } from '../action_summary_message_catalog';
import type { ActionSummaryMessageCatalog, ActionSummaryMessageId } from '../action_summary_message_catalog';

const findingStates = (overrides: Record<string, number> = {}) => ({
    open: 0,
    reopened: 0,
    fixed: 0,
    obsolete: 0,
    dismissed: 0,
    'verification-required': 0,
    unknown: 0,
    ...overrides,
});

describe('action summary policy', () => {
    it('omits an empty localization section and names repository-only runs', () => {
        expect(renderLocalizationSummarySection(undefined)).toBe('');
        expect(buildActionSummary({
            owner: 'owner', repository: 'repo', eventName: 'workflow_dispatch',
            issueNumber: -1, pullRequestNumber: -1, results: [],
        })).toContain('| Target | Repository run |');
    });

    it('renders reusable content-free locale evidence for specialized summaries', () => {
        expect(renderLocalizationSummarySection({
            repository: 'fr-FR',
            issue: 'fr-FR',
            pullRequest: 'es-ES',
        }, [{
            requestedLocale: 'fr-FR',
            resolvedLocale: 'en-US',
            source: 'fallback',
            descriptorCount: 63,
            fallbackReason: 'dynamic-response-invalid',
        }])).toContain('fr-FR -> en-US (fallback, descriptors=63, reason=dynamic-response-invalid)');
    });

    it('keeps Markdown structure code-owned even if an injected catalog bypasses validation', () => {
        const injected: Partial<Record<ActionSummaryMessageId, string>> = {
            'summary.heading': 'Summary\n# Forged heading',
            'summary.repository': '[Forged link](https://example.com)',
            'summary.status': 'Status | forged cell',
            'summary.noResult': '<details>forged block</details>',
        };
        const catalog: ActionSummaryMessageCatalog = {
            locale: 'fr-FR',
            requestedLocale: 'fr-FR',
            resolutionSource: 'dynamic',
            message: id => injected[id] ?? 'Safe',
        };

        const summary = buildActionSummary({
            owner: 'owner', repository: 'repo', eventName: 'issues',
            issueNumber: 7, pullRequestNumber: -1, results: [],
        }, catalog);

        expect(summary).toContain('# Summary # Forged heading');
        expect(summary).toContain('\\[Forged link\\](https:\u200b//example.com)');
        expect(summary).toContain('| Status \\| forged cell |');
        expect(summary).toContain('_\\<details\\>forged block\\</details\\>_');
        expect(summary).not.toContain('\n# Forged heading');
        expect(summary).not.toContain('[Forged link](https://example.com)');
        expect(summary).not.toContain('https://example.com');
        expect(summary).not.toContain('<details>forged block</details>');
    });

    it('sanitizes labels supplied to a specialized localization section', () => {
        const summary = renderLocalizationSummarySection({
            repository: 'en-US', issue: 'en-US', pullRequest: 'en-US',
        }, [], {
            heading: 'Locale\n# Forged',
            property: 'Property | forged',
            value: '[Value](https://example.com)',
            repositoryLocale: '<details>Repository</details>',
            issueLocale: 'Issue',
            pullRequestLocale: 'Pull request',
            catalogResolution: 'Resolution',
            descriptors: 'descriptors',
            reason: 'reason',
        });

        expect(summary).toContain('## Locale # Forged');
        expect(summary).toContain('| Property \\| forged | \\[Value\\](https:\u200b//example.com) |');
        expect(summary).toContain('\\<details\\>Repository\\</details\\>');
        expect(summary).not.toContain('\n# Forged');
        expect(summary).not.toContain('<details>Repository</details>');
    });

    it('renders bounded result details and lifecycle metadata', () => {
        const summary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'issues',
            issueNumber: 7,
            pullRequestNumber: -1,
            lifecycleState: 'planned',
            results: [new Result({ id: 'Plan', success: true, executed: true, steps: ['## Ready', 'safe | text'] })],
        });

        expect(summary).toContain('# Copilot execution');
        expect(summary).toContain('`planned`');
        expect(summary).toContain('safe | text');
        expect(summary).not.toContain('{{');
    });

    it('records effective locales and content-free catalog resolution evidence', () => {
        const summary = buildActionSummary({
            owner: 'owner', repository: 'repo', eventName: 'issues', issueNumber: 7, pullRequestNumber: -1,
            locale: { repository: 'fr-FR', issue: 'es-ES', pullRequest: 'fr-FR' },
            catalogResolutions: [{
                requestedLocale: 'fr-FR', resolvedLocale: 'en-US', source: 'fallback', descriptorCount: 63,
                fallbackReason: 'dynamic-response-invalid',
            }],
            results: [],
        });

        expect(summary).toContain('| Repository locale | `fr-FR` |');
        expect(summary).toContain('| Issue locale | `es-ES` |');
        expect(summary).toContain('fr-FR -> en-US (fallback, descriptors=63, reason=dynamic-response-invalid)');
        expect(summary.match(/## Localization/gu)).toHaveLength(1);
    });

    it('renders the whole summary atomically in the repository locale', () => {
        const summary = buildActionSummary({
            owner: 'owner', repository: 'repo', eventName: 'issues', issueNumber: 7, pullRequestNumber: -1,
            locale: { repository: 'es-ES', issue: 'es-ES', pullRequest: 'es-ES' },
            results: [new Result({
                id: '',
                success: false,
                executed: true,
                errors: [new ApplicationError('workflow.failed', 'Workflow failed.')],
            })],
        }, resolveStaticActionSummaryCatalog('es-ES'));

        expect(summary).toContain('# Ejecución de Copilot');
        expect(summary).toContain('Repositorio: [owner/repo]');
        expect(summary).toContain('| Estado | ❌ Fallo |');
        expect(summary).toContain('| Destino | Issue n.º 7 |');
        expect(summary).toContain('## Detalles del resultado');
        expect(summary).toContain('**Resultado sin nombre**');
        expect(summary).toContain('**Impacto:**');
        expect(summary).toContain('## Localización');
        expect(summary).not.toContain('## Localization');
    });

    it('reports executed failures without exposing raw stack traces', () => {
        const summary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'push',
            issueNumber: -1,
            pullRequestNumber: -1,
            results: [new Result({ id: 'Failure', success: false, executed: true, errors: [new ApplicationError('workflow.failed', 'token=secret-value\n    at hidden()')] })],
        });

        expect(summary).toContain('❌ Failure');
        expect(summary).not.toContain('secret-value');
        expect(summary).not.toContain('at hidden');
    });

    it('reports active findings as a warning unless fail-on-unresolved is enabled', () => {
        const summary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'pull_request',
            issueNumber: -1,
            pullRequestNumber: 12,
            pullRequestDescriptionMode: 'append',
            results: [new Result({
                id: 'Review',
                success: true,
                executed: true,
                payload: { findingStates: findingStates({ open: 1 }) },
            })],
        });

        expect(summary).toContain('⚠️ Findings');
        expect(summary).toContain('open=1');
        expect(summary).toContain('append');

        const blockingSummary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'pull_request',
            issueNumber: -1,
            pullRequestNumber: 12,
            failOnUnresolvedFindings: true,
            results: [new Result({
                id: 'Review', success: true, executed: true,
                payload: { findingStates: findingStates({ open: 1 }) },
            })],
        });
        expect(blockingSummary).toContain('❌ Failure');
    });

    it('aggregates lifecycle counts from every Bugbot result', () => {
        const summary = buildActionSummary({
            owner: 'owner', repository: 'repo', eventName: 'pull_request', issueNumber: -1, pullRequestNumber: 12,
            results: [
                new Result({ id: 'one', success: true, executed: true, payload: { findingStates: findingStates({ open: 1, fixed: 1 }) } }),
                new Result({ id: 'two', success: true, executed: true, payload: { findingStates: findingStates({ reopened: 2, obsolete: 1 }) } }),
            ],
        });

        expect(summary).toContain('open=1, reopened=2, fixed=1, obsolete=1');
    });

    it('shows verification-required as actionable and unknown as a failure', () => {
        const base = {
            owner: 'owner', repository: 'repo', eventName: 'pull_request', issueNumber: -1, pullRequestNumber: 12,
        };
        expect(buildActionSummary({
            ...base,
            results: [new Result({ id: 'review', success: true, executed: true, payload: {
                findingStates: findingStates({ 'verification-required': 1 }),
            } })],
        })).toContain('⚠️ Findings');
        expect(buildActionSummary({
            ...base,
            results: [new Result({ id: 'review', success: true, executed: true, payload: {
                findingStates: findingStates({ unknown: 1 }),
            } })],
        })).toContain('❌ Failure');
    });

    it('fails closed and names malformed owned finding-state evidence', () => {
        const summary = buildActionSummary({
            owner: 'owner', repository: 'repo', eventName: 'pull_request', issueNumber: -1, pullRequestNumber: 12,
            results: [new Result({
                id: 'review', success: true, executed: true, payload: { findingStates: { open: 0 } },
            })],
        });

        expect(summary).toContain('| Status | ❌ Failure |');
        expect(summary).toContain('| Finding states | invalid |');
    });

    it('fails closed when a completed review omits required finding-state evidence', () => {
        const summary = buildActionSummary({
            owner: 'owner', repository: 'repo', eventName: 'pull_request', issueNumber: -1, pullRequestNumber: 12,
            results: [new Result({
                id: 'review', success: true, executed: true,
                payload: { bugbotTelemetry: { schemaVersion: 1, outcome: 'completed', elapsedMs: 11, configuredEffort: 'smart', headSha: 'abc' } },
            })],
        });

        expect(summary).toContain('| Status | ❌ Failure |');
        expect(summary).toContain('| Finding states | invalid |');
    });

    it('fails closed when valid state counts coexist with malformed telemetry', () => {
        const summary = buildActionSummary({
            owner: 'owner', repository: 'repo', eventName: 'pull_request', issueNumber: -1, pullRequestNumber: 12,
            results: [
                new Result({
                    id: 'valid', success: true, executed: true,
                    payload: {
                        bugbotTelemetry: { schemaVersion: 1, outcome: 'completed', elapsedMs: 11, configuredEffort: 'smart', headSha: 'abc' },
                        findingStates: findingStates(),
                    },
                }),
                new Result({
                    id: 'malformed', success: true, executed: true,
                    payload: { bugbotTelemetry: { schemaVersion: 2, outcome: 'completed', elapsedMs: 11 } },
                }),
            ],
        });

        expect(summary).toContain('| Status | ❌ Failure |');
        expect(summary).toContain('| Finding states | invalid |');
        expect(summary).toContain('| Bugbot review | invalid |');
    });

    it.each([
        ['partial', '⚠️ Partial'],
        ['superseded', '⏭️ Superseded'],
        ['skipped', '⏭️ Skipped'],
        ['dry-run', '🧪 Dry run'],
        ['failed', '❌ Failure'],
    ])('renders the semantic %s Bugbot outcome without claiming generic success', (outcome, status) => {
        const requiresFindingStates = ['partial', 'dry-run'].includes(outcome);
        const summary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'pull_request',
            issueNumber: -1,
            pullRequestNumber: 12,
            results: [new Result({
                id: 'Review',
                success: true,
                executed: true,
                payload: {
                    bugbotTelemetry: { schemaVersion: 1, outcome, elapsedMs: 11, configuredEffort: 'smart', headSha: 'abc' },
                    ...(requiresFindingStates ? { findingStates: findingStates() } : {}),
                },
            })],
        });

        expect(summary).toContain(`| Status | ${status} |`);
        expect(summary).toContain(`| Bugbot review | ${outcome}, effort=smart, 11ms |`);
    });
});
