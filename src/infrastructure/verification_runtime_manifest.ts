import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseVerificationRuntimeManifest, VerificationPrerequisiteError,
    VERIFICATION_RUNTIME_MANIFEST, type VerificationRuntimeRequirement } from '../application/policies/verification_runtime_policy';

const MAX_MANIFEST_BYTES = 16 * 1024;

export function readVerificationRuntimeManifest(root: string): readonly VerificationRuntimeRequirement[] {
    const path = resolve(root, VERIFICATION_RUNTIME_MANIFEST);
    let descriptor: number | undefined;
    try {
        let directory;
        try { directory = lstatSync(join(root, '.copilot')); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
        if (!directory.isDirectory() || directory.isSymbolicLink()
            || realpathSync(join(root, '.copilot')) !== join(realpathSync(root), '.copilot')) throw new Error('Unsafe manifest parent');
        let entry;
        try { entry = lstatSync(path, { bigint: true }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
        if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1n || entry.size > BigInt(MAX_MANIFEST_BYTES)) throw new Error('Unsafe manifest');
        descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        const opened = fstatSync(descriptor, { bigint: true });
        if (!opened.isFile() || opened.nlink !== 1n || opened.dev !== entry.dev || opened.ino !== entry.ino
            || opened.size > BigInt(MAX_MANIFEST_BYTES)) throw new Error('Manifest changed');
        const bytes = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
        const size = readSync(descriptor, bytes, 0, bytes.length, 0);
        if (size > MAX_MANIFEST_BYTES) throw new Error('Oversized manifest');
        return parseVerificationRuntimeManifest(JSON.parse(bytes.subarray(0, size).toString('utf8')));
    } catch {
        throw new VerificationPrerequisiteError('manifest-invalid');
    } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
