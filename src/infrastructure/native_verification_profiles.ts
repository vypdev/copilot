import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { VerificationSetupError } from '../application/policies/verification_setup_policy';
import { readNativeRecord, writeNativeRecord } from './native_verification_protocol';

export function nativeVerificationProfilePaths(root: string): string[] {
    const stored = readNativeRecord<unknown>(root, 'profiles.json', 65_536);
    const paths = stored === undefined ? [] : stored;
    if (!Array.isArray(paths) || paths.length > 20 || new Set(paths).size !== paths.length || paths.some(path => typeof path !== 'string'
        || dirname(path) !== dirname(root) || !/^copilot-verify-runtime-[A-Za-z0-9]+$/u.test(basename(path)) || path === root)) throw new VerificationSetupError('handoff-invalid');
    return paths;
}

/** Native actions may have post steps. Preserve dependency-only profiles until those steps finish. */
export function registerNativeVerificationProfile(root: string, profile: string): void {
    const previous = nativeVerificationProfilePaths(root);
    if (previous.length >= 20 || previous.includes(profile) || dirname(profile) !== dirname(root)
        || profile === root || !/^copilot-verify-runtime-[A-Za-z0-9]+$/u.test(basename(profile))
        || realpathSync(profile) !== profile || !lstatSync(profile).isDirectory() || lstatSync(profile).isSymbolicLink()) throw new VerificationSetupError('handoff-invalid');
    writeFileSync(join(profile, 'native-session-owner'), createHash('sha256').update(root).digest('hex'), { mode: 0o600, flag: 'wx' });
    writeNativeRecord(root, 'profiles.json', [...previous, profile]);
}

export function nativeVerificationRetainsProfile(profile: string): boolean {
    const root = process.env.COPILOT_NATIVE_WORKER_SESSION;
    return !!root && nativeVerificationProfilePaths(root).includes(profile);
}

export function removeNativeVerificationProfiles(root: string): void {
    for (const path of nativeVerificationProfilePaths(root)) {
        let stat;
        try { stat = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
        if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path || readFileSync(join(path, 'native-session-owner'), 'utf8') !== createHash('sha256').update(root).digest('hex')) throw new VerificationSetupError('handoff-invalid');
        rmSync(path, { recursive: true, force: true });
    }
}
