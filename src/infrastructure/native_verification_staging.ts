import { lstatSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { PreparedVerificationSetup } from '../application/ports/verification_setup_ports';
import { VerificationSetupError } from '../application/policies/verification_setup_policy';
import { readNativeRecord, writeNativeRecord } from './native_verification_protocol';

export const NATIVE_VERIFICATION_ACTION = '.git/copilot-verification-setup';
interface StagingRecord { readonly target: string }

function targetPath(workspace: string): string {
    const metadata = join(workspace, '.git');
    const stat = lstatSync(metadata);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(metadata) !== metadata) throw new VerificationSetupError('native-workflow-required');
    return join(workspace, NATIVE_VERIFICATION_ACTION);
}

/** Native composite metadata must remain available until its deferred post steps have finished. */
export function stageNativeVerificationAction(setup: Extract<PreparedVerificationSetup, {kind: 'ready'}>, session: string): void {
    const target = targetPath(setup.workspace);
    const record = readNativeRecord<StagingRecord>(session, 'staging.json');
    if (record && record.target !== target || !record && !!lstatSync(target, { throwIfNoEntry: false })) throw new VerificationSetupError('handoff-invalid');
    writeNativeRecord(session, 'staging.json', { target });
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { mode: 0o700 });
    for (const file of setup.files) {
        const destination = join(target, file.path);
        const remainder = relative(target, destination);
        if (!remainder || remainder.startsWith(`..${sep}`) || remainder === '..') throw new VerificationSetupError('helper-invalid');
        mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
        writeFileSync(destination, Buffer.from(file.base64, 'base64'), { mode: file.executable ? 0o700 : 0o600, flag: 'wx' });
    }
}

export function cleanupNativeVerificationAction(session: string, workspace: string): void {
    const record = readNativeRecord<StagingRecord>(session, 'staging.json');
    if (!record) return;
    const target = targetPath(workspace);
    if (record.target !== target) throw new VerificationSetupError('handoff-invalid');
    rmSync(target, { recursive: true, force: true });
    rmSync(join(session, 'staging.json'), { force: true });
}
