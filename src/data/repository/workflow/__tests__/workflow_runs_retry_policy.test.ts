import { withWorkflowRunsRetry } from '../workflow_runs_retry';

describe('workflow runs retry policy', () => {
    it.each([
        [{ statusCode: 503 }],
        [{ response: { status: 502 } }],
        [new Error('Server Error')],
        [{ code: 'ECONNREFUSED' }],
    ])('retries transient error %p', async (error) => {
        const operation = jest.fn()
            .mockRejectedValueOnce(error)
            .mockResolvedValue('ok');
        const delayPort = { wait: jest.fn().mockResolvedValue(undefined) };

        await expect(withWorkflowRunsRetry(operation, delayPort, {
            maximumAttempts: 2,
            initialDelayMilliseconds: 5,
            backoffMultiplier: 2,
            maximumDelayMilliseconds: 20,
        })).resolves.toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
        expect(delayPort.wait).toHaveBeenCalledWith(5);
    });

    it('does not retry a non-transient not-found error', async () => {
        const operation = jest.fn().mockRejectedValue({ status: 404 });
        const delayPort = { wait: jest.fn().mockResolvedValue(undefined) };

        await expect(withWorkflowRunsRetry(operation, delayPort, {
            maximumAttempts: 3,
            initialDelayMilliseconds: 5,
            backoffMultiplier: 2,
            maximumDelayMilliseconds: 20,
        })).rejects.toMatchObject({ status: 404 });
        expect(operation).toHaveBeenCalledTimes(1);
        expect(delayPort.wait).not.toHaveBeenCalled();
    });
});
