import { stopOwnedQualificationFixture, type QualificationFixtureCleanupPorts } from './qualification_process_fixture_cleanup';

const fault = (code: string) => Object.assign(new Error('Controlled ' + code), { code });
function fixture(options: { readFailure?: Error; markerFailure?: Error; termFailure?: Error; killFailure?: Error; gone?: boolean } = {}) {
    const calls: [number, NodeJS.Signals | 0][] = [];
    const ports: QualificationFixtureCleanupPorts = {
        readText() { if (options.readFailure) throw options.readFailure; return '321'; },
        exists: () => true,
        kill(pid, signal) {
            calls.push([pid, signal]);
            if (signal === 0 || options.gone) throw fault('ESRCH');
            if (signal === 'SIGTERM' && options.termFailure) throw options.termFailure;
            if (signal === 'SIGKILL' && options.killFailure) throw options.killFailure;
            return true;
        },
        async until(predicate) {
            if (options.markerFailure) { const error = options.markerFailure; options.markerFailure = undefined; throw error; }
            expect(predicate()).toBe(true);
        },
    };
    return { calls, run: (graceful = true, ownerPid = 123) => stopOwnedQualificationFixture(ownerPid, 'ready', 'stopped', graceful, ports) };
}

it('ev974-C03 fixture cleanup force-kills its spawned group when ready is absent', async () => {
    const f = fixture({ readFailure: fault('ENOENT') }); await f.run();
    expect(f.calls).toEqual([[-123, 'SIGTERM'], [-123, 'SIGKILL']]);
});
it('ev974-C03 fixture cleanup does not require a leader file to identify its spawned owner', async () => {
    const f = fixture({ readFailure: fault('ENOENT') }); await f.run(false, 456);
    expect(f.calls).toEqual([[-456, 'SIGTERM'], [-456, 'SIGKILL']]);
});
it('ev974-C03 fixture cleanup retains a ready-file error after force-killing', async () => {
    const error = fault('EACCES'), f = fixture({ readFailure: error });
    await expect(f.run()).rejects.toBe(error); expect(f.calls).toContainEqual([-123, 'SIGKILL']);
});
it('ev974-C03 fixture cleanup force-kills after graceful-marker failure and retains that cause', async () => {
    const error = new Error('Controlled absent marker'), f = fixture({ markerFailure: error });
    await expect(f.run()).rejects.toBe(error); expect(f.calls).toContainEqual([-123, 'SIGKILL']);
    expect(f.calls.at(-1)).toEqual([321, 0]);
});
it('ev974-C03 fixture cleanup attempts force-kill after a failed graceful signal', async () => {
    const error = fault('EPERM'), f = fixture({ termFailure: error });
    await expect(f.run()).rejects.toBe(error); expect(f.calls).toContainEqual([-123, 'SIGKILL']);
});
it('ev974-C03 fixture cleanup retains force-kill failure instead of reporting success', async () => {
    const error = fault('EPERM'), f = fixture({ killFailure: error });
    await expect(f.run(false)).rejects.toBe(error);
});
it('ev974-C03 fixture cleanup preserves its first error when force-kill also fails', async () => {
    const first = new Error('Controlled graceful failure'), f = fixture({ markerFailure: first, killFailure: fault('EPERM') });
    await expect(f.run()).rejects.toBe(first); expect(f.calls).toContainEqual([-123, 'SIGKILL']);
});
it('ev974-C03 fixture cleanup permits only a positive captured owner identity', async () => {
    for (const ownerPid of [0, 1, -123, NaN, 1.5]) {
        const f = fixture(); await expect(f.run(false, ownerPid)).rejects.toThrow('Exact spawned fixture owner');
        expect(f.calls).toEqual([]);
    }
});
it('ev974-C03 fixture cleanup accepts an already absent owned group and descendant', async () => {
    const f = fixture({ gone: true }); await f.run(false);
    expect(f.calls).toEqual([[-123, 'SIGTERM'], [-123, 'SIGKILL'], [321, 0]]);
});
