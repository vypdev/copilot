import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../../domain/copilot_lifecycle';
import { configureApplicationLogger, resetApplicationLogger } from '../../../ports/logging_ports';
import type { LifecycleSynchronizationContext } from '../lifecycle_synchronization_context';
import { SynchronizeLifecycleStateUseCase } from '../synchronize_lifecycle_state_use_case';

function context(overrides: Partial<LifecycleSynchronizationContext> = {}): LifecycleSynchronizationContext {
    return {
        eventName: 'issues',
        action: 'opened',
        target: {
            kind: 'issue',
            number: 7,
            labels: ['bug', 'state:ready'],
            opened: true,
            descriptionEdited: false,
        },
        lifecycleLabels: DEFAULT_COPILOT_LIFECYCLE_LABELS,
        evidence: { kind: 'none' },
        ...overrides,
    };
}

function ports(labels?: readonly string[]) {
    return {
        labels: {
            getLabels: jest.fn().mockResolvedValue(labels),
            setLabels: jest.fn().mockResolvedValue(undefined),
        },
        head: { getPullRequestHeadSha: jest.fn().mockResolvedValue('sha-1') },
    };
}

describe('SynchronizeLifecycleStateUseCase', () => {
    afterEach(() => resetApplicationLogger());

    it('replaces only managed labels and returns an explicit frozen patch', async () => {
        const dependencies = ports();
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);

        const outcome = await useCase.invoke({
            context: context(),
            results: [{ id: 'RecommendStepsUseCase', success: true, executed: true, steps: [], errors: [] } as never],
        });

        expect(dependencies.labels.setLabels).toHaveBeenCalledWith(
            7,
            ['bug', 'state:planned', 'state:awaiting-maintainer'],
        );
        expect(outcome.results[0]).toMatchObject({ success: true, executed: true });
        expect(outcome.labelPatch).toEqual({
            target: { kind: 'issue', number: 7 },
            labels: ['bug', 'state:planned', 'state:awaiting-maintainer'],
        });
        expect(Object.isFrozen(outcome.labelPatch)).toBe(true);
    });

    it('does not write or patch when labels are already current', async () => {
        const dependencies = ports(['bug', 'state:ai-processing']);
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        const outcome = await useCase.invoke({ context: context(), results: [] });
        expect(outcome).toEqual({ results: [] });
        expect(dependencies.labels.setLabels).not.toHaveBeenCalled();
    });

    it('uses event-time labels only as the missing-provider-inventory fallback', async () => {
        const dependencies = ports(undefined);
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        const lifecycleContext = context({
            action: 'edited',
            target: {
                kind: 'issue',
                number: 7,
                labels: ['bug', 'state:ready'],
                opened: false,
                descriptionEdited: true,
            },
        });
        await useCase.invoke({
            context: lifecycleContext,
            results: [{ id: 'PrepareBranchesUseCase', success: true, executed: true, steps: [], errors: [] } as never],
        });
        expect(dependencies.labels.setLabels).toHaveBeenCalledWith(
            7,
            ['bug', 'state:in-progress'],
        );
    });

    it('preserves fresh non-managed and agent-activity labels', async () => {
        const dependencies = ports(['bug', 'state:ai-processing', 'state:ready', 'size: M']);
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        await useCase.invoke({
            context: context({
                action: 'edited',
                target: {
                    kind: 'issue', number: 7, labels: ['stale'], opened: false, descriptionEdited: true,
                },
            }),
            results: [{ id: 'PrepareBranchesUseCase', success: true, executed: true, steps: [], errors: [] } as never],
        });
        expect(dependencies.labels.setLabels).toHaveBeenCalledWith(
            7,
            ['bug', 'state:ai-processing', 'size: M', 'state:in-progress'],
        );
    });

    it('maps active findings to pull-request and issue-author waiting labels', async () => {
        const dependencies = ports(['state:ai-processing', 'state:reviewing']);
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        await useCase.invoke({
            context: context({
                eventName: 'pull_request',
                action: 'synchronize',
                target: { kind: 'pull-request', number: 11, labels: [], merged: false, closed: false },
            }),
            results: [{
                id: 'DetectPotentialProblemsUseCase',
                success: true,
                executed: true,
                steps: [],
                errors: [],
                payload: { findingStates: {
                    open: 1, reopened: 0, fixed: 0, obsolete: 0, dismissed: 0,
                    'verification-required': 0, unknown: 0,
                } },
            } as never],
        });
        expect(dependencies.labels.setLabels).toHaveBeenCalledWith(
            11,
            ['state:ai-processing', 'state:changes-requested', 'state:awaiting-issue-author'],
        );
    });

    it('replaces a stale ready label when Bugbot coverage is partial', async () => {
        const dependencies = ports(['state:ready', 'state:awaiting-maintainer']);
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        await useCase.invoke({
            context: context({
                eventName: 'pull_request',
                action: 'synchronize',
                target: { kind: 'pull-request', number: 11, labels: [], merged: false, closed: false },
            }),
            results: [{
                id: 'DetectPotentialProblemsUseCase',
                success: true,
                executed: true,
                steps: [],
                errors: [],
                payload: {
                    findingStates: {
                        open: 0, reopened: 0, fixed: 0, obsolete: 0, dismissed: 0,
                        'verification-required': 0, unknown: 0,
                    },
                    bugbotTelemetry: {
                        schemaVersion: 1,
                        outcome: 'partial',
                        elapsedMs: 10,
                        configuredEffort: 'smart',
                        headSha: 'sha-123',
                    },
                },
            } as never],
        });
        expect(dependencies.labels.setLabels).toHaveBeenCalledWith(
            11,
            ['state:blocked', 'state:awaiting-maintainer'],
        );
    });

    it('clears waiting state for a pull-request conversation comment', async () => {
        const dependencies = ports(['state:changes-requested', 'state:awaiting-issue-author']);
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        const outcome = await useCase.invoke({
            context: context({
                eventName: 'issue_comment',
                action: 'created',
                target: { kind: 'pull-request', number: 11, labels: [], merged: false, closed: false },
            }),
            results: [],
        });
        expect(dependencies.labels.setLabels).toHaveBeenCalledWith(11, ['state:changes-requested']);
        expect(outcome.labelPatch?.target.kind).toBe('pull-request');
    });

    it('uses current-head evidence through the bound head capability', async () => {
        const dependencies = ports(['state:reviewing']);
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        await useCase.invoke({
            context: context({
                eventName: 'check_suite',
                action: 'completed',
                target: { kind: 'pull-request', number: 11, labels: [], merged: false, closed: false },
                evidence: { kind: 'check-suite', headSha: 'sha-1', status: 'completed', conclusion: 'failure' },
            }),
            results: [],
        });
        expect(dependencies.head.getPullRequestHeadSha).toHaveBeenCalledWith(11);
        expect(dependencies.labels.setLabels).toHaveBeenCalledWith(
            11,
            ['state:blocked', 'state:awaiting-maintainer'],
        );
    });

    it('verifies review evidence against the bound current-head capability', async () => {
        const dependencies = ports(['state:reviewing']);
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        await useCase.invoke({
            context: context({
                eventName: 'pull_request_review',
                action: 'submitted',
                target: { kind: 'pull-request', number: 11, labels: [], merged: false, closed: false },
                evidence: { kind: 'pull-request-review', headSha: 'sha-1', state: 'approved' },
            }),
            results: [],
        });
        expect(dependencies.head.getPullRequestHeadSha).toHaveBeenCalledWith(11);
        expect(dependencies.labels.setLabels).toHaveBeenCalledWith(
            11,
            ['state:ready', 'state:awaiting-maintainer'],
        );
    });

    it('degrades safely when current-head lookup fails', async () => {
        const dependencies = ports(['state:reviewing']);
        dependencies.head.getPullRequestHeadSha.mockRejectedValue(new Error('secret-head-marker'));
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        const outcome = await useCase.invoke({
            context: context({
                eventName: 'pull_request_review',
                action: 'submitted',
                target: { kind: 'pull-request', number: 11, labels: [], merged: false, closed: false },
                evidence: { kind: 'pull-request-review', headSha: 'sha-1', state: 'approved' },
            }),
            results: [],
        });
        expect(outcome).toEqual({ results: [] });
        expect(dependencies.labels.setLabels).not.toHaveBeenCalled();
    });

    it('performs no provider I/O without a target', async () => {
        const dependencies = ports();
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        expect(await useCase.invoke({
            context: context({ target: undefined }),
            results: [],
        })).toEqual({ results: [] });
        expect(dependencies.labels.getLabels).not.toHaveBeenCalled();
        expect(dependencies.head.getPullRequestHeadSha).not.toHaveBeenCalled();
    });

    it('returns and logs only a semantic error when label I/O fails', async () => {
        const marker = 'provider-secret-marker';
        const dependencies = ports();
        dependencies.labels.getLabels.mockRejectedValue(new Error(marker));
        const logError = jest.fn();
        configureApplicationLogger({
            logInfo: jest.fn(), logWarn: jest.fn(), logWarning: jest.fn(), logError,
            logDebugInfo: jest.fn(), logDebugWarning: jest.fn(), logDebugError: jest.fn(),
            setGlobalLoggerDebug: jest.fn(),
        });
        const useCase = new SynchronizeLifecycleStateUseCase(dependencies.labels, dependencies.head);
        const outcome = await useCase.invoke({ context: context(), results: [] });
        const serialized = JSON.stringify({ outcome, logCalls: logError.mock.calls });
        expect(outcome.results[0]).toMatchObject({ success: false, executed: true });
        expect(outcome.labelPatch).toBeUndefined();
        expect(outcome.results[0].errors[0].message).toBe('Unable to synchronize Copilot lifecycle state.');
        expect(serialized).not.toContain(marker);
    });
});
