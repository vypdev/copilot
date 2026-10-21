import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { VerificationSetupError } from '../application/policies/verification_setup_policy';

export interface NativeVerificationSession {
    readonly schemaVersion: 1;
    readonly workspace: string;
    readonly run: string;
    readonly attempt: string;
    readonly job: string;
    readonly pid: number;
}
export interface NativeVerificationRequest {
    readonly id: string;
    readonly sourceSha: string;
    readonly environment: Record<string, string>;
}
export interface NativeVerificationResponse {
    readonly id: string;
    readonly success: boolean;
    readonly path: string;
    readonly javaHome?: string;
}

export function writeNativeRecord(root: string, name: string, value: unknown): void {
    const temporary = join(root, `${randomUUID()}.tmp`);
    writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, join(root, name));
}

export function readNativeRecord<T>(root: string, name: string, limit = 16_384): T | undefined {
    const file = join(root, name);
    let descriptor: number | undefined;
    try {
        const before = lstatSync(file, { bigint: true });
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(limit)) throw new Error();
        descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const after = fstatSync(descriptor, { bigint: true });
        if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.mtimeNs !== before.mtimeNs) throw new Error();
        const data = readFileSync(descriptor);
        const final = fstatSync(descriptor, { bigint: true });
        if (data.length > limit || final.size !== after.size || final.mtimeNs !== after.mtimeNs) throw new Error();
        return JSON.parse(data.toString('utf8')) as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw new VerificationSetupError('handoff-invalid');
    } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

export function nativeSession(root: string, environment = process.env): NativeVerificationSession {
    if (!/^copilot-verify-runtime-[A-Za-z0-9]+$/u.test(basename(root)) || realpathSync(root) !== root
        || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new VerificationSetupError('handoff-invalid');
    if (process.platform !== 'win32' && (lstatSync(root).mode & 0o077) !== 0) throw new VerificationSetupError('handoff-invalid');
    const session = readNativeRecord<NativeVerificationSession>(root, 'session.json');
    if (session?.schemaVersion !== 1 || session.workspace !== realpathSync(process.cwd())
        || session.run !== (environment.GITHUB_RUN_ID ?? '') || session.attempt !== (environment.GITHUB_RUN_ATTEMPT ?? '')
        || session.job !== (environment.GITHUB_JOB ?? '') || !Number.isSafeInteger(session.pid) || session.pid <= 0) throw new VerificationSetupError('handoff-invalid');
    return session;
}

export const nativePause = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));
