const rawLabels = {
    getLabels: jest.fn().mockResolvedValue(['state:reviewing']),
    setLabels: jest.fn().mockResolvedValue(undefined),
};
const rawHead = { getPullRequestHeadSha: jest.fn().mockResolvedValue('sha-1') };
const pullRequestClient = { kind: 'pull-request-client' };
const useCase = { kind: 'lifecycle-use-case' };
const createIssueLabelRepository = jest.fn(() => rawLabels);
const createPullRequestLifecycleClient = jest.fn(() => pullRequestClient);
const pullRequestLifecycleRepository = jest.fn(() => rawHead);
const synchronizeLifecycleStateUseCase = jest.fn(() => useCase);

jest.mock('../issue_labels_composition_root', () => ({ createIssueLabelRepository }));
jest.mock('../github_pull_request_client_factory', () => ({ createPullRequestLifecycleClient }));
jest.mock('../../../data/repository/pull_request/pull_request_lifecycle_repository', () => ({
    PullRequestLifecycleRepository: pullRequestLifecycleRepository,
}));
jest.mock('../../../application/usecases/actions/synchronize_lifecycle_state_use_case', () => ({
    SynchronizeLifecycleStateUseCase: synchronizeLifecycleStateUseCase,
}));

import { createSynchronizeLifecycleStateUseCase } from '../lifecycle_state_composition_root';
import type { BoundIssueLabelsPort, BoundPullRequestHeadShaPort } from '../../../application/ports/issue_management_ports';

describe('lifecycle state composition root', () => {
    it('binds repository credentials before constructing the lifecycle use case', async () => {
        const result = createSynchronizeLifecycleStateUseCase({
            owner: 'acme', repository: 'demo', token: 'secret',
        });

        expect(result).toBe(useCase);
        expect(createIssueLabelRepository).toHaveBeenCalledTimes(1);
        expect(createPullRequestLifecycleClient).toHaveBeenCalledTimes(1);
        expect(pullRequestLifecycleRepository).toHaveBeenCalledWith(pullRequestClient);
        const [labels, head] = (synchronizeLifecycleStateUseCase.mock.calls as unknown[][])[0] as [
            BoundIssueLabelsPort,
            BoundPullRequestHeadShaPort,
        ];
        await labels.getLabels(7);
        await labels.setLabels(7, ['state:ready']);
        await head.getPullRequestHeadSha(7);
        expect(rawLabels.getLabels).toHaveBeenCalledWith('acme', 'demo', 7, 'secret');
        expect(rawLabels.setLabels).toHaveBeenCalledWith('acme', 'demo', 7, ['state:ready'], 'secret');
        expect(rawHead.getPullRequestHeadSha).toHaveBeenCalledWith('acme', 'demo', 7, 'secret');
    });
});
