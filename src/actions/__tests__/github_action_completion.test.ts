import type { Execution } from '../../data/model/execution';
import { Ai } from '../../data/model/ai';
import { Result } from '../../data/model/result';
import { finishGithubAction } from '../github_action_completion';
import * as core from '@actions/core';

jest.mock('@actions/core', () => ({ setOutput: jest.fn(), setFailed: jest.fn() }));

const mockPublishInvoke = jest.fn();
const mockStoreInvoke = jest.fn();
const mockSummaryPublish = jest.fn();
const mockEvidencePublish = jest.fn();

jest.mock('../../application/usecases/steps/common/publish_resume_use_case', () => ({
    PublishResultUseCase: jest.fn().mockImplementation(() => ({ invoke: mockPublishInvoke })),
}));

jest.mock('../../application/usecases/steps/common/store_configuration_use_case', () => ({
    StoreConfigurationUseCase: jest.fn().mockImplementation(() => ({ invoke: mockStoreInvoke })),
}));

jest.mock('../../utils/logger', () => ({ logInfo: jest.fn() }));

const recommendationState = {
    issueDescriptionFingerprint: 'description-hash',
    recommendationFingerprint: 'recommendation-hash',
    recommendation: '1. Add tests',
};

function execution(): Execution {
    return {
        currentConfiguration: { results: [] },
        isSingleAction: false,
        singleAction: { throwError: false },
        ai: new Ai('', 'model', false, [], false, 'low', 20),
    } as unknown as Execution;
}

function singleActionExecution(isRecommendStepsAction = false, isPublishIssueCommentAction = false): Execution {
    return {
        currentConfiguration: { results: [] },
        isSingleAction: true,
        singleAction: { throwError: true, isRecommendStepsAction, isPublishIssueCommentAction },
        ai: new Ai('', 'model', false, [], false, 'low', 20),
    } as unknown as Execution;
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
        expect(mockStoreInvoke).toHaveBeenCalledWith(action);
    });

    it('does not commit a pending recommendation state when publication fails', async () => {
        mockPublishInvoke.mockImplementation(async (action: Execution) => {
            action.currentConfiguration.results.push(new Result({
                id: 'PublishResultUseCase',
                success: false,
                executed: true,
            }));
        });
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

    it('persists configuration for the recommendation single action', async () => {
        const action = singleActionExecution(true);

        await finishGithubAction(action, [], {} as never, {} as never);

        expect(mockStoreInvoke).toHaveBeenCalledWith(action);
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

    it('fails the action for unresolved findings only when the generic policy is enabled', async () => {
        const findingResult = new Result({
            id: 'DetectPotentialProblemsUseCase',
            success: true,
            executed: true,
            payload: { findingStates: { open: 2, reopened: 1, fixed: 0, obsolete: 0, dismissed: 0 } },
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
        expect(core.setFailed).toHaveBeenCalledWith('Bugbot found 3 unresolved actionable finding(s).');
    });

    it('fails every workflow that reports an application error', async () => {
        const failed = new Result({
            id: 'AgentBackedFeature',
            success: false,
            executed: true,
            errors: ['Agent execution failed.'],
        });

        await finishGithubAction(execution(), [failed], {} as never, {} as never);

        expect(core.setFailed).toHaveBeenCalledWith('Agent execution failed.');
    });
});
