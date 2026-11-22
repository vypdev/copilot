/** Test-fixture cleanup only. This process group is not Linux namespace proof. */
export interface QualificationFixtureCleanupPorts {
    readText(file: string): string;
    exists(file: string): boolean;
    kill(pid: number, signal: NodeJS.Signals | 0): boolean;
    until(predicate: () => boolean): Promise<void>;
}

export async function stopOwnedQualificationFixture(ownerPid: number, ready: string, stopped: string,
    graceful: boolean, ports: QualificationFixtureCleanupPorts): Promise<void> {
    if (!Number.isSafeInteger(ownerPid) || ownerPid <= 1) throw new Error('Exact spawned fixture owner required.');
    let descendant: number | undefined, failure: { cause: unknown } | undefined;
    const retain = (cause: unknown) => { failure ??= { cause }; };
    const signal = (value: NodeJS.Signals) => {
        try { ports.kill(-ownerPid, value); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    };
    try {
        try {
            const text = ports.readText(ready).trim();
            if (!/^[1-9]\d*$/u.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) <= 1) {
                throw new Error('Invalid owned fixture descendant observation.');
            }
            descendant = Number(text);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') retain(error);
        }
        try { signal('SIGTERM'); } catch (error) { retain(error); }
        if (graceful && descendant !== undefined && !failure) {
            try { await ports.until(() => ports.exists(stopped)); } catch (error) { retain(error); }
        }
    } finally {
        try { signal('SIGKILL'); } catch (error) { retain(error); }
    }
    if (descendant !== undefined) {
        try {
            await ports.until(() => {
                try { ports.kill(descendant!, 0); return false; }
                catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true; throw error; }
            });
        } catch (error) { retain(error); }
    }
    if (failure) throw failure.cause;
}
