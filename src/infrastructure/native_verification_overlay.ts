import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { PreparedVerificationSetup } from '../application/ports/verification_setup_ports';
import { VERIFICATION_SETUP_DIRECTORY, VerificationSetupError } from '../application/policies/verification_setup_policy';
import { readNativeRecord, writeNativeRecord } from './native_verification_protocol';

interface OverlayRecord { readonly target: string; readonly backup: string; readonly existed: boolean; readonly created: string[] }

/** A temporary reviewed action overlays the candidate path only while the operation is paused. */
export function stageNativeVerificationAction(setup: Extract<PreparedVerificationSetup, {kind: 'ready'}>, session: string): void {
    const target = join(setup.workspace, VERIFICATION_SETUP_DIRECTORY);
    const backup = join(session, 'candidate-action');
    const created: string[] = [];
    let parent = setup.workspace;
    for (const part of VERIFICATION_SETUP_DIRECTORY.split('/').slice(0, -1)) {
        parent = join(parent, part);
        if (existsSync(parent)) {
            if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory() || realpathSync(parent) !== parent) throw new VerificationSetupError('helper-invalid');
        } else { mkdirSync(parent, { mode: 0o700 }); created.push(parent); }
    }
    const targetStat = lstatSync(target, { throwIfNoEntry: false });
    const existed = !!targetStat;
    if (targetStat && (targetStat.isSymbolicLink() || !targetStat.isDirectory())) throw new VerificationSetupError('helper-invalid');
    const record: OverlayRecord = { target, backup, existed, created };
    writeNativeRecord(session, 'overlay.json', record);
    if (existed) renameSync(target, backup);
    mkdirSync(target, { mode: 0o700 });
    for (const file of setup.files) {
        const destination = join(target, file.path);
        const remainder = relative(target, destination);
        if (!remainder || remainder.startsWith(`..${sep}`) || remainder === '..') throw new VerificationSetupError('helper-invalid');
        mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
        writeFileSync(destination, Buffer.from(file.base64, 'base64'), { mode: file.executable ? 0o700 : 0o600, flag: 'wx' });
    }
}

export function restoreNativeVerificationAction(session: string, workspace: string): void {
    const record = readNativeRecord<OverlayRecord>(session, 'overlay.json');
    if (!record) return;
    if (record.target !== join(workspace, VERIFICATION_SETUP_DIRECTORY) || record.backup !== join(session, 'candidate-action')
        || !Array.isArray(record.created) || record.created.some(path => ![join(workspace, '.github'), join(workspace, '.github/actions')].includes(path))) throw new VerificationSetupError('handoff-invalid');
    for (const parent of [join(workspace, '.github'), join(workspace, '.github/actions')]) {
        if (!existsSync(parent) || lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory() || realpathSync(parent) !== parent) throw new VerificationSetupError('handoff-invalid');
    }
    // A backup is the authoritative original. A second cleanup must never remove it.
    if (record.existed && !existsSync(record.backup)) return;
    rmSync(record.target, { recursive: true, force: true });
    if (record.existed) renameSync(record.backup, record.target);
    for (const directory of [...record.created].reverse()) { try { rmdirSync(directory); } catch { /* Other candidate content remains. */ } }
    rmSync(join(session, 'overlay.json'), { force: true });
}
