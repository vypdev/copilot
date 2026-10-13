import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

/** One real isolated SSR compiler per suite; every request is rendered. */
export function useWebSetupRenderer() {
    let child: ChildProcess | undefined;
    let sequence = 0;
    let closing = false;
    let diagnostics = '';
    const pending = new Map<number, { resolve: (html: string) => void; reject: (error: Error) => void }>();
    const rejectPending = (error: Error) => { for (const request of pending.values()) request.reject(error); pending.clear(); };

    beforeAll(() => new Promise<void>((ready, failed) => {
        child = fork(resolve(__dirname, '../scripts/render-web-setup-component.cjs'), ['--ipc'], {
            execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        });
        child.stderr?.on('data', data => { diagnostics = (diagnostics + String(data)).slice(-4_096); });
        child.on('error', error => { failed(error); rejectPending(error); });
        child.on('exit', (code, signal) => {
            if (!closing) {
                const error = new Error(`Component renderer exited (${code ?? signal}): ${diagnostics}`);
                failed(error); rejectPending(error);
            }
        });
        child.on('message', value => {
            if (!value || typeof value !== 'object') return;
            const message = value as { type?: unknown; id?: unknown; html?: unknown; message?: unknown };
            if (message.type === 'ready') { ready(); return; }
            if (typeof message.id !== 'number') return;
            const request = pending.get(message.id);
            if (!request) return;
            pending.delete(message.id);
            if (message.type === 'rendered' && typeof message.html === 'string') request.resolve(message.html);
            else request.reject(new Error(typeof message.message === 'string' ? message.message : 'Invalid component render response.'));
        });
    }));

    afterAll(() => new Promise<void>(done => {
        closing = true;
        if (!child || child.exitCode !== null || child.signalCode !== null) { done(); return; }
        child.once('exit', () => done());
        if (!child.connected) { child.kill(); return; }
        child.send({ type: 'close' }, error => { if (error) child?.kill(); });
    }));

    return (name: string, props: Record<string, unknown>, locale = 'en') => new Promise<string>((fulfilled, rejected) => {
        if (!child?.connected || closing) { rejected(new Error('Component renderer is unavailable.')); return; }
        const id = ++sequence;
        pending.set(id, { resolve: fulfilled, reject: rejected });
        child.send({ type: 'render', id, name, props: JSON.stringify(props), locale }, error => {
            if (error) { pending.delete(id); rejected(error); }
        });
    });
}
