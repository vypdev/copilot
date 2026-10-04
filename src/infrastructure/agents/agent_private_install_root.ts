import { accessSync, chmodSync, constants, lstatSync, mkdtempSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
    const relation = relative(root, path);
    if (!isWithinPrivateRoot(relation)) throw new Error('Official agent installer output escaped its private directory.');
    const canonicalPath = resolvePrivateInstalledFile(root, canonicalRoot, relation);
    if (process.platform === 'win32' && lstatSync(path).isSymbolicLink()) {
        throw new Error('Official agent installer output is a Windows symlink.');
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
    accessSync(canonicalPath, constants.X_OK);
    return canonicalPath;
}

function isWithinPrivateRoot(relation: string): boolean {
    return Boolean(relation) && relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

/** Follow installer launch links only while each hop stays under our private root. */
function resolvePrivateInstalledFile(root: string, canonicalRoot: string, relation: string): string {
    let current = canonicalRoot;
    let pending = relation.split(sep).filter(Boolean);
    let links = 0;
    while (pending.length > 0) {
        const next = resolve(current, pending.shift()!);
        if (!isWithinPrivateRoot(relative(canonicalRoot, next))) {
            throw new Error('Official agent installer output escaped its private directory.');
        }
        const entry = lstatSync(next);
        if (entry.isSymbolicLink()) {
            // The official Windows Codex installer publishes bin and current as
            // directory junctions. Never admit a linked executable itself.
            if (process.platform === 'win32' && pending.length === 0) {
                throw new Error('Official agent installer output is a Windows symlink.');
            }
            if (++links > 32) throw new Error('Official agent installer output has too many links.');
            const target = resolve(dirname(next), normalizedLinkTarget(readlinkSync(next)));
            const canonicalRelation = relative(canonicalRoot, target);
            const targetRelation = isWithinPrivateRoot(canonicalRelation)
                ? canonicalRelation : relative(root, target);
            if (!isWithinPrivateRoot(targetRelation)) {
                throw new Error('Official agent installer output escaped its private directory.');
            }
            pending = [...targetRelation.split(sep).filter(Boolean), ...pending];
            current = canonicalRoot;
        } else if (pending.length > 0 && !entry.isDirectory()) {
            throw new Error('Official agent installer output has a non-directory ancestor.');
        } else {
            current = next;
            if (pending.length === 0 && !entry.isFile()) {
                throw new Error('Official agent installer did not create a file.');
            }
        }
    }
    return current;
}

function normalizedLinkTarget(target: string): string {
    if (process.platform !== 'win32') return target;
    // Node may return the NT namespaced form of a junction target. Compare its
    // ordinary drive path with the private root before following any next hop.
    const namespaced = target.startsWith('\\\\?\\') || target.startsWith('\\??\\');
    const ordinary = namespaced ? target.slice(4) : target;
    return /^[A-Za-z]:\\/u.test(ordinary) ? ordinary : target;
}
