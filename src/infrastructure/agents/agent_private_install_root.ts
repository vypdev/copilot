import { chmodSync, lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { makeWindowsRuntimePathPrivate, verifyWindowsAgentExecutableAcl } from './windows_runtime_acl';

const INSTALL_PREFIX = 'copilot-agent-install-';

/** Keep a failed candidate from preventing a safer profile-local fallback. */
export function selectPrivateInstallRoot(
    parents: readonly string[],
    prepare: (parent: string) => string,
): string {
    const tried = new Set<string>();
    for (const parent of parents) {
        const key = parent.toLowerCase();
        if (tried.has(key)) continue;
        tried.add(key);
        try {
            return prepare(parent);
        } catch {
            // The candidate is cleaned by prepare before another parent is tried.
        }
    }
    throw new Error('No protected agent installation directory is available.');
}

export function prepareWindowsInstallRoot(
    parent: string,
    verify: (path: string) => void = verifyWindowsAgentExecutableAcl,
): string {
    const root = mkdtempSync(join(parent, INSTALL_PREFIX));
    const probe = join(root, '.acl-probe');
    try {
        chmodSync(root, 0o700);
        makeWindowsRuntimePathPrivate(root, true);
        writeFileSync(probe, '', { flag: 'wx' });
        makeWindowsRuntimePathPrivate(probe, false);
        verify(probe);
        rmSync(probe);
        return root;
    } catch (error) {
        rmSync(root, { recursive: true, force: true });
        throw error;
    }
}

export function createPrivateAgentInstallRoot(): string {
    if (process.platform === 'win32') {
        return selectPrivateInstallRoot([
            process.env.RUNNER_TEMP || tmpdir(),
            join(homedir(), 'AppData', 'Local', 'Temp'),
        ], prepareWindowsInstallRoot);
    }
    const root = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), INSTALL_PREFIX));
    chmodSync(root, 0o700);
    return root;
}

/** This may change ACLs only for a newly installed file contained in our root. */
export function securePrivateInstalledAgent(root: string, path: string): string {
    const canonicalRoot = realpathSync(root);
    const canonicalPath = realpathSync(path);
    const relation = relative(canonicalRoot, canonicalPath);
    if (!relation || relation.startsWith('..') || isAbsolute(relation) || lstatSync(path).isSymbolicLink()) {
        throw new Error('Official agent installer output escaped its private directory.');
    }
    if (process.platform === 'win32') {
        const directories: string[] = [];
        let parent = dirname(canonicalPath);
        while (parent !== canonicalRoot) {
            const parentRelation = relative(canonicalRoot, parent);
            if (!parentRelation || parentRelation.startsWith('..') || isAbsolute(parentRelation)) {
                throw new Error('Official agent installer output escaped its private directory.');
            }
            directories.unshift(parent);
            parent = dirname(parent);
        }
        for (const directory of directories) makeWindowsRuntimePathPrivate(directory, true);
        makeWindowsRuntimePathPrivate(canonicalPath, false);
        verifyWindowsAgentExecutableAcl(canonicalPath);
    }
    return canonicalPath;
}
