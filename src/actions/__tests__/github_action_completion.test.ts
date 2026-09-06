import type { Execution } from '../../data/model/execution';
import { Result } from '../../data/model/result';
import { finishGithubAction } from '../github_action_completion';

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
    } as unknown as Execution;
}

function singleActionExecution(isRecommendStepsAction = false): Execution {
    return {
        currentConfiguration: { results: [] },
        isSingleAction: true,
        singleAction: { throwError: true, isRecommendStepsAction },
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
});
