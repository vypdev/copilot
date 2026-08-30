import { commitUserRequestIfSuccessful } from '../commit_user_request_workflow';
import { Result } from '../../../../../../data/model/result';

const mockRunUserRequestCommitAndPush = jest.fn();

jest.mock('../bugbot_autofix_commit', () => ({
    runUserRequestCommitAndPush: (...args: unknown[]) => mockRunUserRequestCommitAndPush(...args),
}));

describe('commitUserRequestIfSuccessful', () => {
    beforeEach(() => mockRunUserRequestCommitAndPush.mockReset());

    it('does not commit when the agent request failed', async () => {
        const results = await commitUserRequestIfSuccessful(
            {} as never,
            undefined,
            [new Result({ success: false, executed: true })],
            {} as never,
            {} as never,
        );

        expect(results).toEqual([]);
        expect(mockRunUserRequestCommitAndPush).not.toHaveBeenCalled();
    });

    it('returns a successful result when changes were pushed', async () => {
        mockRunUserRequestCommitAndPush.mockResolvedValue({ success: true, committed: true });

        const results = await commitUserRequestIfSuccessful(
            {} as never,
            'feature/1',
            [new Result({ success: true, executed: true })],
            {} as never,
            {} as never,
        );

        expect(results[0]).toMatchObject({
            id: 'DoUserRequestCommitAndPush',
            success: true,
            executed: true,
        });
    });

    it('returns a terminal failure when commit or push fails', async () => {
        mockRunUserRequestCommitAndPush.mockResolvedValue({
            success: false,
            committed: false,
            error: 'push failed with token=secret-value',
        });

        const results = await commitUserRequestIfSuccessful(
            {} as never,
            undefined,
            [new Result({ success: true, executed: true })],
            {} as never,
            {} as never,
        );

        expect(results[0]).toMatchObject({
            id: 'DoUserRequestCommitAndPush',
            success: false,
            executed: true,
        });
        expect(results[0].errors[0].message).not.toContain('secret-value');
    });
});
