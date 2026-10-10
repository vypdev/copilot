import { cleanupActionRun } from '../setup_permission_workflow_cleanup';
import { SetupPermissionProbeHttp } from '../setup_permission_probe_http';

const root = 'https://api.github.com/repos/owner/repo';
const branch = `copilot-permission-test-${'a'.repeat(32)}`;
const run = { id: 7, head_branch: branch, event: 'workflow_dispatch', workflow_id: 123 };
const reply = (status: number, body?: unknown) => new Response(status === 204 || status === 404 ? null : JSON.stringify(body), { status });

describe('asynchronous temporary Actions cleanup', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function fixture(completeAfterMs: number, cancelStatus: (elapsed: number) => number = () => 202,
        observe?: (elapsed: number) => Response | undefined) {
        const start = Date.now();
        let deleted = false;
        const fetcher = jest.fn(async (url: string | URL | Request, options?: RequestInit) => {
            const elapsed = Date.now() - start;
            if (String(url) === `${root}/actions/runs/7/cancel`) return reply(cancelStatus(elapsed));
            expect(String(url)).toBe(`${root}/actions/runs/7`);
            if (options?.method === 'DELETE') {
                // Deletion before completion is never a successful fixture.
                expect(elapsed).toBeGreaterThanOrEqual(completeAfterMs);
                deleted = true;
                return reply(204);
            }
            if (deleted) return reply(404);
            return observe?.(elapsed) ?? reply(200, { ...run,
                status: elapsed >= completeAfterMs ? 'completed' : 'queued', conclusion: 'skipped' });
        });
        const result = cleanupActionRun(new SetupPermissionProbeHttp(fetcher, 'fixture', 1000), root, branch, 7, true, 123)
            .catch(error => error);
        return { result, fetcher, methods: () => fetcher.mock.calls.map(call => call[1]?.method) };
    }

    it.each([11000, 57000])('waits for a skipped run that completes after %sms, then confirms deletion', async delay => {
        const value = fixture(delay);
        await jest.advanceTimersByTimeAsync(4000);
        expect(value.methods()).not.toContain('DELETE');
        await jest.advanceTimersByTimeAsync(56000);
        expect(await value.result).toBeUndefined();
        expect(value.methods().filter(method => method === 'POST')).toHaveLength(1);
        expect(value.methods().filter(method => method === 'DELETE')).toHaveLength(1);
        expect(value.methods().at(-1)).toBe('GET');
    });
    it('retries a queued cancellation conflict and stops retrying once cancellation is accepted', async () => {
        const value = fixture(11000, elapsed => elapsed === 0 ? 409 : 202);
        await jest.advanceTimersByTimeAsync(15000);
        expect(await value.result).toBeUndefined();
        expect(value.methods().filter(method => method === 'POST')).toHaveLength(2);
    });
    it('stops when cancellation retry is denied without deleting an active run', async () => {
        const value = fixture(11000, elapsed => elapsed === 0 ? 409 : 403);
        await jest.advanceTimersByTimeAsync(1000);
        expect(await value.result).toMatchObject({ httpStatus: 403 });
        expect(value.methods()).not.toContain('DELETE');
    });
    it('rechecks run ownership before retrying a cancellation conflict', async () => {
        const value = fixture(11000, () => 409, elapsed => elapsed > 0
            ? reply(200, { ...run, head_branch: 'another-branch', status: 'queued' }) : undefined);
        await jest.advanceTimersByTimeAsync(1000);
        expect(await value.result).toHaveProperty('message', expect.stringContaining('identity changed'));
        expect(value.methods().filter(method => method === 'POST')).toHaveLength(1);
        expect(value.methods()).not.toContain('DELETE');
    });
    it.each([202, 409])('bounds a run that never finishes even when cancellation returns %s', async status => {
        const value = fixture(Infinity, () => status);
        await jest.advanceTimersByTimeAsync(60000);
        expect(await value.result).toHaveProperty('message', expect.stringContaining('cleanup deadline'));
        expect(value.methods()).not.toContain('DELETE');
        expect(value.methods().filter(method => method === 'GET')).toHaveLength(15);
        expect(value.methods().filter(method => method === 'POST')).toHaveLength(status === 202 ? 1 : 15);
        const count = value.fetcher.mock.calls.length;
        await jest.advanceTimersByTimeAsync(60000);
        expect(value.fetcher).toHaveBeenCalledTimes(count);
    });
    it('retains an active run when a later status lookup becomes unavailable', async () => {
        const value = fixture(11000, () => 202, elapsed => elapsed > 0 ? reply(503) : undefined);
        await jest.advanceTimersByTimeAsync(1000);
        expect(await value.result).toMatchObject({ httpStatus: 503 });
        expect(value.methods()).not.toContain('DELETE');
    });
    it('accepts exact-run absence after a late queued state without issuing deletion', async () => {
        const value = fixture(Infinity, () => 202, elapsed => elapsed >= 30000 ? reply(404) : undefined);
        await jest.advanceTimersByTimeAsync(35000);
        expect(await value.result).toBeUndefined();
        expect(value.methods()).not.toContain('DELETE');
    });
});
