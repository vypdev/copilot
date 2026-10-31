import { lstat, mkdir, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { safariContainerProfile, type SafariContainerKind } from './safari_profile.mts';

async function regularDirectory(directory: string): Promise<void> {
    try {
        if (!(await lstat(directory)).isDirectory()) throw new Error('prerequisite:safari-workspace-not-regular');
    } catch (error) {
        if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') throw error;
        await mkdir(directory);
    }
}
/** Fixed profile directories cannot traverse a symlink into a rollback or another integration. */
export async function prepareSafariBuildPaths(root: string, kind: SafariContainerKind) {
    const profile = safariContainerProfile(kind); let directory = root;
    for (const part of ['.tmp', profile.folder, 'derived', 'Build', 'Products', 'Debug']) {
        directory = path.join(directory, part); await regularDirectory(directory);
    }
    const workspace = path.join(root, '.tmp', profile.folder); const app = path.join(directory, `${profile.appName}.app`);
    try {
        if (!(await lstat(app)).isDirectory()) throw new Error('prerequisite:safari-app-not-regular');
    } catch (error) { if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') throw error; }
    return { profile, workspace, app };
}
/** Only the call that created this profile lock can release it. Existing locks require inspection. */
export async function withSafariBuildLock<T>(workspace: string, run: () => Promise<T>): Promise<T> {
    const lock = path.join(workspace, '.build.lock');
    try { await mkdir(lock); }
    catch (error) { throw new Error('prerequisite:safari-build-lock-unavailable', { cause: error }); }
    try {
        await writeSafariEvidence(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, node: process.version, startedAt: new Date().toISOString() }) + '\n');
        return await run();
    } finally { await rm(lock, { recursive: true }); }
}
/** Do not follow diagnostic-file links into an existing integration. */
export async function writeSafariEvidence(file: string, text: string): Promise<void> {
    try {
        if (!(await lstat(file)).isFile()) throw new Error('prerequisite:safari-evidence-not-regular');
    } catch (error) { if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') throw error; }
    await writeFile(file, text, { encoding: 'utf8', flag: constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW });
}
