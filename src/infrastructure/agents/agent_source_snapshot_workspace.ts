import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { AgentCliError } from '../../data/repository/agent_cli_contracts';
import { SddSourceContextFailure, type AgentSourceSnapshot } from '../../domain/agent_source_snapshot';
import { SOURCE_SNAPSHOT_LIMITS } from '../../application/policies/agent_source_snapshot_policy';
import { SourceSnapshotGit, type SourceSnapshotFile } from './agent_source_snapshot_git';

export interface SourceSnapshotManifest {
    readonly schemaVersion: 1;
    readonly source: AgentSourceSnapshot;
    readonly anchor: string;
    readonly treeSha: string;
    readonly bytes: number;
    readonly files: readonly SourceSnapshotFile[];
    readonly directories: readonly string[];
    readonly gitFiles: Readonly<Record<string, string>>;
    readonly gitDirectories: readonly string[];
}

/** Enumerates owned regular files without following symbolic links or directory junctions. */
export function sourceSnapshotFiles(root: string, prefix = '', directories?: string[]): string[] {
    const result: string[] = [];
    for (const name of readdirSync(join(root, prefix))) {
        const relative = prefix ? `${prefix}/${name}` : name, entry = lstatSync(join(root, relative));
        if (entry.isSymbolicLink()) throw new Error('Source snapshot entry is not regular.');
        if (entry.isDirectory()) { directories?.push(relative); result.push(...sourceSnapshotFiles(root, relative, directories)); }
        else if (entry.isFile()) result.push(relative);
        else throw new Error('Source snapshot entry is not regular.');
    }
    return result.sort();
}

/** Self-contained local snapshot; the canonical Git index, HEAD, refs and worktrees are untouched. */
export function prepareSourceSnapshotWorkspace(anchor: string, source: AgentSourceSnapshot,
    runtimeDirectory: string, deadline: number, signal?: AbortSignal): { readonly workspace: string; readonly manifest: SourceSnapshotManifest } {
    try {
        const git = new SourceSnapshotGit(source, runtimeDirectory, Math.min(deadline, performance.now() + SOURCE_SNAPSHOT_LIMITS.preparationMs), signal);
        const canonicalAnchor = realpathSync(anchor), inventory = git.inventory(canonicalAnchor);
        const root = join(runtimeDirectory, 'source'); mkdirSync(root, { mode: 0o700 });
        const workspace = realpathSync(root);
        git.seed(canonicalAnchor, workspace, inventory);
        const blobs = git.blobs(workspace, inventory.files);
        for (const directory of inventory.directories) {
            git.remaining(); mkdirSync(join(workspace, directory), { recursive: true, mode: 0o700 });
        }
        for (const file of inventory.files) {
            git.remaining();
            const target = join(workspace, file.path); mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
            writeFileSync(target, blobs.get(file.objectId)!, { flag: 'wx', mode: file.mode === '100755' ? 0o500 : 0o400 });
        }
        const gitFiles: Record<string, string> = {}, gitDirectories: string[] = [];
        for (const file of sourceSnapshotFiles(join(workspace, '.git'), '', gitDirectories)) {
            git.remaining();
            const path = join(workspace, '.git', file); chmodSync(path, 0o600);
            gitFiles[`.git/${file}`] = createHash('sha256').update(readFileSync(path)).digest('hex');
        }
        git.remaining();
        return Object.freeze({ workspace, manifest: Object.freeze({ schemaVersion: 1, source, anchor: canonicalAnchor,
            treeSha: inventory.treeSha, bytes: inventory.bytes, files: inventory.files, directories: inventory.directories,
            gitFiles: Object.freeze(gitFiles), gitDirectories: Object.freeze(gitDirectories.sort()) }) });
    } catch (error) {
        if (error instanceof SddSourceContextFailure || error instanceof AgentCliError) throw error;
        throw new SddSourceContextFailure('materialization-failed', source);
    }
}
