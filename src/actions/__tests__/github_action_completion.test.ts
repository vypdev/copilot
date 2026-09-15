import type { Execution } from '../../data/model/execution';
import { Ai } from '../../data/model/ai';
import { Result } from '../../data/model/result';
import { finishGithubAction } from '../github_action_completion';
import * as core from '@actions/core';
import { ApplicationError } from '../../application/errors/application_error';
import type { DeploymentOperationSnapshot } from '../../domain/deployment_operation';
import { ResolveMessageCatalogUseCase } from '../../application/usecases/localization/resolve_message_catalog_use_case';

jest.mock('@actions/core', () => ({ setOutput: jest.fn(), setFailed: jest.fn() }));

const mockPublishInvoke = jest.fn();
const mockStoreInvoke = jest.fn();
const mockSummaryPublish = jest.fn();
const mockEvidencePublish = jest.fn();

jest.mock('../../application/usecases/steps/common/publish_resume_use_case', () => ({
    PublishResultUseCase: jest.fn().mockImplementation(() => ({ invoke: mockPublishInvoke })),
}));

jest.mock('../../application/usecases/steps/common/store_configuration_use_case', () => ({
    ...jest.requireActual('../../application/usecases/steps/common/store_configuration_use_case'),
    StoreConfigurationUseCase: jest.fn().mockImplementation(() => ({ invoke: mockStoreInvoke })),
}));

jest.mock('../../utils/logger', () => ({ logInfo: jest.fn() }));

const recommendationState = {
    issueDescriptionFingerprint: 'description-hash',
    recommendationFingerprint: 'recommendation-hash',
    recommendation: '1. Add tests',
};

function deploymentOperation(): DeploymentOperationSnapshot {
    return {
        stateVersion: 1,
        revision: 3,
        operationId: 'operation-12345678',
        locale: { repository: 'es-ES', issue: 'fr-FR', pullRequest: 'de-DE', issueOverride: 'fr-FR', pullRequestOverride: 'de-DE' },
        kind: 'release',
        version: '3.4.0',
        title: 'Release',
        changelog: 'Changes',
        phase: 'promotion_pr_pending',
        strategy: 'production-lineage',
        prMode: 'auto',
        selectedPrMode: 'auto-merge',
        backmergeMode: 'auto',
        hotfixActiveReleasePolicy: 'prefer-release',
        cleanup: 'all',
        issueCompletion: 'close',
        presentationMode: 'guided',
        diagrams: true,
        commentMode: 'update',
        sourceBranch: 'release/3.4.0',
        sourceSha: 'a'.repeat(40),
        originBranch: 'develop',
        originSha: 'b'.repeat(40),
        productionBranch: 'master',
        developmentBranch: 'develop',
        reconciliationTree: 'sync',
        promotionPullRequest: 40,
        tag: 'v3.4.0',
        publicationWorkflow: 'release_workflow.yml',
        publicationVerified: false,
        reconciliationTargets: [],
        lastFailure: null,
    };
}

function execution(): Execution {
    return {
        owner: 'test-owner',
        repo: 'test-repo',
        eventName: 'issues',
        currentConfiguration: { results: [] },
        isSingleAction: false,
        isIssue: true,
        isPullRequest: false,
        isPush: false,
        isBugfix: false,
        isFeature: false,
        isDocs: false,
        isChore: false,
        issueNumber: 11,
        issueNotBranched: false,
        issue: { number: 11 },
        pullRequest: { number: -1 },
        locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
        singleAction: { issue: -1, throwError: false },
        release: { active: false },
        hotfix: { active: false },
        debug: false,
        images: {
            imagesOnIssue: false,
            issueAutomaticActions: [],
            issueFeatureGifs: [],
            issueBugfixGifs: [],
            issueReleaseGifs: [],
            issueHotfixGifs: [],
            issueDocsGifs: [],
            issueChoreGifs: [],
            imagesOnPullRequest: false,
            pullRequestAutomaticActions: [],
            pullRequestFeatureGifs: [],
            pullRequestBugfixGifs: [],
            pullRequestReleaseGifs: [],
            pullRequestHotfixGifs: [],
            pullRequestDocsGifs: [],
            pullRequestChoreGifs: [],
        },
        tokens: { token: 'product-pat' },
        ai: new Ai('', 'model', false, [], false, 'low', 20),
    } as unknown as Execution;
}

function singleActionExecution(isRecommendStepsAction = false, isPublishIssueCommentAction = false): Execution {
    return Object.assign(execution(), {
        isSingleAction: true,
        singleAction: {
            issue: 11,
            throwError: true,
            isRecommendStepsAction,
            isPublishIssueCommentAction,
        },
    }) as Execution;
}

describe('finishGithubAction', () => {
    const originalEvidenceToken = process.env.COPILOT_EVIDENCE_TOKEN;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPublishInvoke.mockResolvedValue(undefined);
        mockStoreInvoke.mockResolvedValue(undefined);
        mockSummaryPublish.mockResolvedValue(undefined);
        mockEvidencePublish.mockResolvedValue(undefined);
        delete process.env.COPILOT_EVIDENCE_TOKEN;
    });

    afterAll(() => {
        if (originalEvidenceToken === undefined) delete process.env.COPILOT_EVIDENCE_TOKEN;
        else process.env.COPILOT_EVIDENCE_TOKEN = originalEvidenceToken;
    });

    it('commits a pending recommendation state after successful publication', async () => {
        const action = execution();
        const results = [new Result({
            id: 'RecommendStepsUseCase',
            success: true,
            executed: true,
            steps: ['Recommendation'],
            payload: { recommendationState },
        })];

        await finishGithubAction(action, results, {} as never, {} as never);

        expect(action.currentConfiguration.recommendationState).toEqual(recommendationState);
        expect(mockStoreInvoke).toHaveBeenCalledWith(expect.objectContaining({
            issueNumber: 11,
            currentConfiguration: expect.objectContaining({ recommendationState }),
        }));
    });

    it('does not commit a pending recommendation state when publication fails', async () => {
        mockPublishInvoke.mockImplementation(async () => (
            new Result({
                id: 'PublishResultUseCase',
                success: false,
                executed: true,
            })
        ));
        const action = execution();
        const results = [new Result({
            id: 'RecommendStepsUseCase',
            success: true,
            executed: true,
            steps: ['Recommendation'],
            payload: { recommendationState },
        })];

        await finishGithubAction(action, results, {} as never, {} as never);

        expect(action.currentConfiguration.recommendationState).toBeUndefined();
    });

    it('does not persist configuration for a non-stateful single action', async () => {
        const action = singleActionExecution();

        await finishGithubAction(action, [], {} as never, {} as never);

        expect(mockStoreInvoke).not.toHaveBeenCalled();
    });

    it('routes a Think answer through the shared correlated publication boundary', async () => {
        const action = Object.assign(execution(), {
            eventName: 'issue_comment',
            tokenUser: 'vypbot',
            inputs: { action: 'created', comment: { id: 42 } },
        });
        const answer = new Result({
            id: 'ThinkUseCase', success: true, executed: true,
            payload: { publication: {
                kind: 'direct-answer', answer: 'Use the documented setting.',
                translation: {
                    translatedText: 'use the setting',
                    originalText: 'usa el ajuste',
                    sourceLocale: 'es-ES',
                    targetLocale: 'en-US',
                },
            } },
        });

        await finishGithubAction(action, [answer], {} as never, {} as never);

        expect(mockPublishInvoke).toHaveBeenCalledWith(expect.objectContaining({
            target: { kind: 'issue', number: 11 },
            requestCorrelationId: 'comment:42',
            results: [expect.objectContaining({
                id: 'ThinkUseCase',
                payload: expect.objectContaining({ publication: expect.objectContaining({
                    kind: 'direct-answer',
                    answer: 'Use the documented setting.',
                    translation: expect.objectContaining({ sourceLocale: 'es-ES' }),
                }) }),
            })],
        }));
    });

    it('persists configuration for the recommendation single action', async () => {
        const action = singleActionExecution(true);

        await finishGithubAction(action, [], {} as never, {} as never);

        expect(mockStoreInvoke).toHaveBeenCalledWith(expect.objectContaining({ issueNumber: 11 }));
    });

    it('does not publish a second result comment for the issue-comment single action', async () => {
        const action = singleActionExecution(false, true);

        await finishGithubAction(action, [new Result({
            id: 'PublishIssueCommentUseCase',
            success: true,
            executed: true,
        })], {} as never, {} as never);

        expect(mockPublishInvoke).not.toHaveBeenCalled();
        expect(mockStoreInvoke).not.toHaveBeenCalled();
    });

    it('keeps every publication and persistence side effect disabled for a dry run', async () => {
        const action = Object.assign(execution(), {
            owner: 'test-owner',
            repo: 'test-repo',
            eventName: 'pull_request',
            inputs: { pull_request: { head: { sha: 'abc1234' } } },
            tokens: { token: 'product-pat' },
        });
        const results = [new Result({
            id: 'BranchSyncUseCase',
            success: true,
            executed: true,
            payload: { dryRun: true },
        })];

        await finishGithubAction(action, results, {} as never, {} as never, { publish: mockEvidencePublish });

        expect(mockPublishInvoke).not.toHaveBeenCalled();
        expect(mockStoreInvoke).not.toHaveBeenCalled();
        expect(mockEvidencePublish).not.toHaveBeenCalled();
        expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('publishes the summary only through the explicitly provided output port', async () => {
        const action = Object.assign(execution(), {
            owner: 'test-owner',
            repo: 'test-repo',
            eventName: 'issues',
        });
        const results = [new Result({
            id: 'RecommendStepsUseCase',
            success: true,
            executed: true,
            steps: ['Recommendation'],
        })];

        await finishGithubAction(action, results, {} as never, {} as never, undefined, { publish: mockSummaryPublish });

        expect(mockSummaryPublish).toHaveBeenCalledWith(expect.stringContaining('test-owner/test-repo'));
    });

    it('uses one repository-locale section in a localized generic summary', async () => {
        const action = Object.assign(execution(), {
            locale: { repository: 'es-ES', issue: 'es-ES', pullRequest: 'es-ES' },
        });
        const resolver = new ResolveMessageCatalogUseCase();

        await finishGithubAction(
            action,
            [new Result({ id: 'MetadataUseCase', success: true, executed: true, steps: ['Updated labels.'] })],
            {} as never,
            {} as never,
            undefined,
            { publish: mockSummaryPublish },
            resolver,
        );

        const summary = mockSummaryPublish.mock.calls[0][0] as string;
        expect(summary).toContain('# Ejecución de Copilot');
        expect(summary).toContain('| Estado | ✅ Correcto |');
        expect(summary).toContain('| Resultados | Completado: 1 · Fallido: 0 · Omitido: 0 |');
        expect(summary).not.toContain('## Detalles del fallo');
        expect(summary).toContain('| Locale del repositorio | `es-ES` |');
        expect(summary.match(/## Localización/gu)).toHaveLength(1);
        expect(summary).not.toContain('MetadataUseCase');
        expect(summary).not.toContain('Updated labels.');
        expect(summary).not.toContain('## Localization');
    });

    it('uses the durable repository locale for deployment summaries without replaying internal steps', async () => {
        const action = Object.assign(singleActionExecution(), {
            singleAction: {
                ...singleActionExecution().singleAction,
                issue: 11,
                isDeploymentOrchestrationAction: true,
            },
            currentConfiguration: { results: [], deploymentOrchestration: deploymentOperation() },
        }) as Execution;
        const resolver = new ResolveMessageCatalogUseCase();
        const resolve = jest.spyOn(resolver, 'resolve');
        const results = [new Result({
            id: 'DeploymentOrchestrationUseCase',
            success: true,
            executed: true,
            steps: ['Created promotion PR #40'],
        })];

        await finishGithubAction(
            action,
            results,
            {} as never,
            {} as never,
            undefined,
            { publish: mockSummaryPublish },
            resolver,
        );

        const summary = mockSummaryPublish.mock.calls[0][0] as string;
        expect(summary).toContain('# ⏳ Orquestación del despliegue');
        expect(summary).not.toContain('Created promotion PR #40');
        expect(summary).toContain('## Localización');
        expect(summary).toContain('| Propiedad | Valor |');
        expect(summary).toContain('| Locale del repositorio | `es-ES` |');
        expect(summary).not.toContain('## Localization');
        expect(summary).toContain('`es-ES -> es-ES (exact');
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ targetLocale: 'es-ES' }));
        expect(mockPublishInvoke).not.toHaveBeenCalled();
    });

    it('links the published package from the first-party deployment summary', async () => {
        const base = deploymentOperation();
        const productionSha = 'c'.repeat(40);
        const action = Object.assign(singleActionExecution(), {
            owner: 'vypdev',
            repo: 'copilot',
            singleAction: {
                ...singleActionExecution().singleAction,
                issue: 11,
                isDeploymentOrchestrationAction: true,
            },
            currentConfiguration: {
                results: [],
                deploymentOrchestration: {
                    ...base,
                    phase: 'published',
                    productionSha,
                    publicationVerified: true,
                    publicationReceipt: {
                        tag: base.tag,
                        productionSha,
                        operationId: base.operationId,
                        releaseUrl: 'https://github.com/vypdev/copilot/releases/tag/v3.4.0',
                    },
                },
            },
        }) as Execution;

        await finishGithubAction(
            action,
            [new Result({ id: 'DeploymentOrchestrationUseCase', success: true, executed: true })],
            {} as never,
            {} as never,
            undefined,
            { publish: mockSummaryPublish },
        );

        expect(mockSummaryPublish).toHaveBeenCalledWith(expect.stringContaining(
            'https://www.npmjs.com/package/%40vypdev%2Fcopilot/v/3.4.0',
        ));
    });

    it('uses the current repository locale for a legacy deployment without a locale snapshot', async () => {
        const { locale: _locale, ...legacyOperation } = deploymentOperation();
        const action = Object.assign(singleActionExecution(), {
            locale: { repository: 'es-ES', issue: 'es-ES', pullRequest: 'es-ES' },
            singleAction: {
                ...singleActionExecution().singleAction,
                issue: 11,
                isDeploymentOrchestrationAction: true,
            },
            currentConfiguration: { results: [], deploymentOrchestration: legacyOperation },
        }) as Execution;

        await finishGithubAction(
            action,
            [new Result({ id: 'DeploymentOrchestrationUseCase', success: true, executed: true })],
            {} as never,
            {} as never,
            undefined,
            { publish: mockSummaryPublish },
        );

        expect(mockSummaryPublish).toHaveBeenCalledWith(expect.stringContaining('# ⏳ Orquestación del despliegue'));
    });

    it('uses the short-lived evidence token only for the native Check Run', async () => {
        process.env.COPILOT_EVIDENCE_TOKEN = 'github-actions-token';
        const action = Object.assign(execution(), {
            owner: 'test-owner',
            repo: 'test-repo',
            eventName: 'pull_request',
            inputs: { pull_request: { head: { sha: 'abc1234' } } },
            tokens: { token: 'product-pat' },
        });
        const results = [new Result({
            id: 'DetectPotentialProblemsUseCase',
            success: true,
            executed: true,
            steps: ['Review completed'],
            payload: {
                bugbotTelemetry: {
                    schemaVersion: 1,
                    outcome: 'no-findings',
                    elapsedMs: 12,
                    configuredEffort: 'smart',
                    headSha: 'abc1234',
                },
                findingStates: completeFindingStates(),
            },
        })];

        await finishGithubAction(
            action,
            results,
            {} as never,
            {} as never,
            { publish: mockEvidencePublish },
        );

        expect(mockEvidencePublish).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Copilot / Review', headSha: 'abc1234' }),
            'test-owner',
            'test-repo',
            'github-actions-token',
        );
    });

    it('keeps metadata-only PR completion out of the stable Review Check', async () => {
        const action = Object.assign(execution(), {
            owner: 'test-owner',
            repo: 'test-repo',
            eventName: 'pull_request',
            isIssue: false,
            isPullRequest: true,
            pullRequest: { number: 12, action: 'edited' },
            inputs: { pull_request: { head: { sha: 'abc1234' } } },
        });
        const results = [new Result({
            id: 'UpdateTitleUseCase',
            success: true,
            executed: true,
            steps: ['Title normalized'],
        })];

        await finishGithubAction(
            action,
            results,
            {} as never,
            {} as never,
            { publish: mockEvidencePublish },
            { publish: mockSummaryPublish },
        );

        const summary = mockSummaryPublish.mock.calls[0][0] as string;
        expect(summary).toContain('| Results | Succeeded: 1 · Failed: 0 · Skipped: 0 |');
        expect(summary).not.toContain('UpdateTitleUseCase');
        expect(summary).not.toContain('Title normalized');
        expect(mockPublishInvoke).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en-US' }));
        expect(mockEvidencePublish).not.toHaveBeenCalled();
    });

    it('keeps metadata-only failures visible without adding a generic PR comment', async () => {
        const action = Object.assign(execution(), {
            eventName: 'pull_request',
            isIssue: false,
            isPullRequest: true,
            pullRequest: { number: 12, action: 'edited' },
        });
        const failure = new Result({
            id: 'UpdateTitleUseCase',
            success: false,
            executed: true,
            errors: [new ApplicationError('provider.unavailable', 'Title normalization failed.')],
        });

        await finishGithubAction(
            action,
            [failure],
            {} as never,
            {} as never,
            undefined,
            { publish: mockSummaryPublish },
        );

        expect(mockPublishInvoke).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en-US' }));
        expect(mockSummaryPublish).toHaveBeenCalledWith(expect.stringContaining('`provider.unavailable`'));
        expect(mockSummaryPublish).toHaveBeenCalledWith(expect.not.stringContaining('Title normalization failed.'));
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Error code: provider.unavailable'));
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Action: Retry when the provider is available.'));
        expect(core.setFailed).not.toHaveBeenCalledWith(expect.stringContaining('Title normalization failed.'));
    });

    it('fails the action for unresolved findings only when the generic policy is enabled', async () => {
        const findingResult = new Result({
            id: 'DetectPotentialProblemsUseCase',
            success: true,
            executed: true,
            payload: { findingStates: completeFindingStates({ open: 2, reopened: 1 }) },
        });
        const nonBlocking = Object.assign(execution(), {
            ai: new Ai('', 'model', false, [], false, 'low', 20, [], undefined, undefined, { failOnUnresolved: false }),
        });
        await finishGithubAction(nonBlocking, [findingResult], {} as never, {} as never);
        expect(core.setFailed).not.toHaveBeenCalled();

        const blocking = Object.assign(execution(), {
            ai: new Ai('', 'model', false, [], false, 'low', 20, [], undefined, undefined, { failOnUnresolved: true }),
        });
        await finishGithubAction(blocking, [findingResult], {} as never, {} as never);
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Error code: workflow.failed'));
    });

    it('fails every workflow that reports an application error', async () => {
        const failed = new Result({
            id: 'AgentBackedFeature',
            success: false,
            executed: true,
            errors: [new ApplicationError('agent.failed', 'Agent execution failed.')],
        });

        await finishGithubAction(execution(), [failed], {} as never, {} as never);

        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Error code: agent.failed'));
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Action: Inspect the sanitized agent status'));
        expect(core.setFailed).not.toHaveBeenCalledWith(expect.stringContaining('Agent execution failed.'));
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringMatching(/Reference: [0-9a-f-]{36}/));
    });

    it('renders the complete failure atomically in the repository locale', async () => {
        const action = Object.assign(execution(), {
            locale: { repository: 'es-MX', issue: 'es-MX', pullRequest: 'es-MX' },
        });
        const failed = new Result({
            id: 'AgentBackedFeature',
            success: false,
            executed: true,
            errors: [new ApplicationError('provider.rate-limited', 'English provider message.')],
        });

        await finishGithubAction(action, [failed], {} as never, {} as never);

        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Impacto: El proveedor limitó temporalmente la operación.'));
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Código de error: provider.rate-limited'));
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Reintentable: Sí'));
        expect(core.setFailed).not.toHaveBeenCalledWith(expect.stringContaining('English provider message.'));
        expect(core.setFailed).not.toHaveBeenCalledWith(expect.stringContaining('Impact:'));
    });

    it('preserves operation-specific recovery context in the same catalog locale', async () => {
        const action = Object.assign(execution(), {
            locale: { repository: 'es-ES', issue: 'es-ES', pullRequest: 'es-ES' },
        });
        const failed = new Result({
            id: 'PrepareManagedBranchUseCase',
            success: false,
            executed: true,
            errors: [new ApplicationError('provider.unavailable', 'Producer message.', {
                recovery: {
                    id: 'managed-branch-enrichment-failed',
                    variables: { branchName: 'feature/42-localized-errors' },
                },
            })],
        });

        await finishGithubAction(
            action,
            [failed],
            {} as never,
            {} as never,
            undefined,
            { publish: mockSummaryPublish },
        );

        const expected = 'Se conservaron la rama feature/42-localized-errors y su parche de configuración.';
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining(expected));
        expect(mockSummaryPublish).toHaveBeenCalledWith(expect.stringContaining(expected));
        expect(core.setFailed).not.toHaveBeenCalledWith(expect.stringContaining('Producer message.'));
        expect(core.setFailed).not.toHaveBeenCalledWith(expect.stringContaining('El proveedor no estaba disponible'));
    });

    it('always fails unknown finding state and applies the configured policy to verification-required', async () => {
        const resultWith = (findingStates: Record<string, number>) => new Result({
            id: 'DetectPotentialProblemsUseCase', success: true, executed: true, payload: { findingStates },
        });
        await finishGithubAction(execution(), [resultWith(completeFindingStates({ unknown: 1 }))], {} as never, {} as never);
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Error code: provider.contract-invalid'));

        jest.mocked(core.setFailed).mockClear();
        const blocking = Object.assign(execution(), {
            ai: new Ai('', 'model', false, [], false, 'low', 20, [], undefined, undefined, { failOnUnresolved: true }),
        });
        await finishGithubAction(blocking, [resultWith(completeFindingStates({ 'verification-required': 2 }))], {} as never, {} as never);
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Error code: workflow.failed'));
    });

    it('fails closed when owned finding-state evidence is malformed', async () => {
        const malformed = new Result({
            id: 'DetectPotentialProblemsUseCase',
            success: true,
            executed: true,
            payload: { findingStates: { open: 0 } },
        });

        await finishGithubAction(execution(), [malformed], {} as never, {} as never);

        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Error code: provider.contract-invalid'));
    });

    it('fails closed when review telemetry requires but omits finding-state evidence', async () => {
        const missing = new Result({
            id: 'DetectPotentialProblemsUseCase',
            success: true,
            executed: true,
            payload: {
                bugbotTelemetry: {
                    schemaVersion: 1,
                    outcome: 'no-findings',
                    elapsedMs: 10,
                    configuredEffort: 'smart',
                    headSha: 'abc1234',
                },
            },
        });

        await finishGithubAction(execution(), [missing], {} as never, {} as never);

        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Error code: provider.contract-invalid'));
    });

    it('fails closed when valid review state coexists with malformed telemetry', async () => {
        const valid = new Result({
            id: 'valid',
            success: true,
            executed: true,
            payload: {
                bugbotTelemetry: {
                    schemaVersion: 1,
                    outcome: 'completed',
                    elapsedMs: 10,
                    configuredEffort: 'smart',
                    headSha: 'abc1234',
                },
                findingStates: completeFindingStates(),
            },
        });
        const malformed = new Result({
            id: 'malformed',
            success: true,
            executed: true,
            payload: { bugbotTelemetry: { schemaVersion: 2, outcome: 'completed', elapsedMs: 10 } },
        });

        await finishGithubAction(execution(), [valid, malformed], {} as never, {} as never);

        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Error code: provider.contract-invalid'));
    });
});

function completeFindingStates(overrides: Record<string, number> = {}): Record<string, number> {
    return {
        open: 0,
        reopened: 0,
        fixed: 0,
        obsolete: 0,
        dismissed: 0,
        'verification-required': 0,
        unknown: 0,
        ...overrides,
    };
}
