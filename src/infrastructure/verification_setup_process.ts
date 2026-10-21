import { spawn, spawnSync } from 'node:child_process';
import { trustedWindowsSystemTool } from './agents/agent_trusted_system_tools';
import { VerificationSetupError, VERIFICATION_SETUP_LIMITS } from '../application/policies/verification_setup_policy';

/** All output is counted and discarded. Fixed production limits; short injected limits are for deterministic tests. */
export function runVerificationSetupProcess(node: string, script: string, cwd: string, env: Record<string, string>, sourceSha: string,
    limits: { timeoutMs: number; outputBytes: number } = VERIFICATION_SETUP_LIMITS): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(node, [script], { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
        let failure: 'timeout' | 'cancelled' | 'output-limit' | 'process-failed' | undefined;
        let outputBytes = 0;
        const terminate = (): void => {
            if (!child.pid) return;
            try {
                if (process.platform === 'win32') spawnSync(trustedWindowsSystemTool('taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { env, windowsHide: true, timeout: 5_000, stdio: 'ignore', shell: false });
                else process.kill(-child.pid, 'SIGKILL');
            } catch { child.kill('SIGKILL'); }
        };
        const timer = setTimeout(() => { failure ??= 'timeout'; terminate(); }, limits.timeoutMs);
        const cancel = (): void => { failure ??= 'cancelled'; terminate(); };
        process.once('SIGINT', cancel);
        process.once('SIGTERM', cancel);
        const capture = (data: Buffer): void => {
            outputBytes += data.length;
            if (outputBytes > limits.outputBytes) { failure ??= 'output-limit'; terminate(); }
        };
        child.stdout.on('data', capture);
        child.stderr.on('data', capture);
        child.on('error', () => { failure ??= 'process-failed'; });
        child.on('close', code => {
            clearTimeout(timer);
            process.removeListener('SIGINT', cancel);
            process.removeListener('SIGTERM', cancel);
            terminate();
            if (failure || code !== 0) reject(new VerificationSetupError(failure ?? 'process-failed', sourceSha, code ?? undefined));
            else resolve();
        });
    });
}
