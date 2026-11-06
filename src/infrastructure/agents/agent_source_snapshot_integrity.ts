import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentManagedArtifact } from '../../domain/agent_execution_plan';
import { readAgentSourceSnapshot, SddSourceContextFailure, type AgentSourceSnapshot } from '../../domain/agent_source_snapshot';
import { isSourceSnapshotPath, SOURCE_SNAPSHOT_LIMITS as LIMIT } from '../../application/policies/agent_source_snapshot_policy';
import { gitBlobId } from './agent_source_snapshot_git';
import { sourceSnapshotFiles, type SourceSnapshotManifest } from './agent_source_snapshot_workspace';

/** The generic artifact verifier checks the manifest hash before this semantic admission. */
export function verifySourceSnapshotWorkspace(source: AgentSourceSnapshot, workspace: string,
    runtimeDirectory: string, artifacts: readonly AgentManagedArtifact[]): void {
    const reject = (): never => { throw new SddSourceContextFailure('view-integrity', source); };
    try {
        const snapshot = readAgentSourceSnapshot(source);
        if (!snapshot) throw new SddSourceContextFailure('view-integrity');
        const manifestPath = join(runtimeDirectory, 'source-snapshot.json');
        const bindings = artifacts.filter(artifact => artifact.purpose === 'source-snapshot');
        if (bindings.length !== 1 || realpathSync(bindings[0].path) !== realpathSync(manifestPath)
            || lstatSync(workspace).isSymbolicLink() || realpathSync(workspace) !== realpathSync(join(runtimeDirectory, 'source'))) reject();
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as SourceSnapshotManifest;
        const bound = readAgentSourceSnapshot(manifest.source);
        if (manifest.schemaVersion !== 1 || !bound || bound.baseSha !== snapshot.baseSha || bound.phase !== snapshot.phase
            || !/^[a-f0-9]{40}$/u.test(manifest.treeSha) || !Array.isArray(manifest.files)
            || manifest.files.length > LIMIT.files || !Array.isArray(manifest.directories) || !Array.isArray(manifest.gitDirectories)
            || !manifest.directories.every(path => typeof path === 'string' && isSourceSnapshotPath(path))
            || !manifest.gitDirectories.every(path => typeof path === 'string' && isSourceSnapshotPath(path))
            || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 0 || manifest.bytes > LIMIT.totalBytes
            || !manifest.gitFiles || typeof manifest.gitFiles !== 'object' || Array.isArray(manifest.gitFiles)) reject();
        if (process.env.GITHUB_ACTIONS === 'true'
            && (!process.env.GITHUB_WORKSPACE || realpathSync(process.env.GITHUB_WORKSPACE) !== manifest.anchor)) reject();
        const directories: string[] = [], actual = sourceSnapshotFiles(workspace, '', directories);
        const equalPaths = (left: readonly string[], right: readonly string[]) => left.map(path => path.normalize('NFC')).sort().join('\0') === right.map(path => path.normalize('NFC')).sort().join('\0');
        const gitPaths = Object.keys(manifest.gitFiles);
        if (!gitPaths.every(path => path.startsWith('.git/') && isSourceSnapshotPath(path.slice(5)))
            || !equalPaths(directories, [...manifest.directories, '.git', ...manifest.gitDirectories.map(path => `.git/${path}`)])) reject();
        const expected = [...manifest.files.map(file => file.path), ...Object.keys(manifest.gitFiles)].sort();
        if (!equalPaths(actual, expected)) reject();
        let bytes = 0;
        for (const file of manifest.files) {
            if (!isSourceSnapshotPath(file.path) || !/^[a-f0-9]{40}$/u.test(file.objectId)
                || !['100644', '100755'].includes(file.mode) || !Number.isSafeInteger(file.bytes)
                || file.bytes < 0 || file.bytes > LIMIT.blobBytes || lstatSync(join(workspace, file.path)).size !== file.bytes) reject();
            const value = readFileSync(join(workspace, file.path)); bytes += value.length;
            if (value.length !== file.bytes || gitBlobId(value) !== file.objectId
                || (process.platform !== 'win32' && Boolean(lstatSync(join(workspace, file.path)).mode & 0o100) !== (file.mode === '100755'))) reject();
        }
        if (bytes !== manifest.bytes) reject();
        for (const [file, digest] of Object.entries(manifest.gitFiles)) {
            if (createHash('sha256').update(readFileSync(join(workspace, file))).digest('hex') !== digest) reject();
        }
        if (readFileSync(join(workspace, '.git', 'HEAD'), 'utf8') !== `${snapshot.baseSha}\n`
            || readFileSync(join(workspace, '.git', 'shallow'), 'utf8') !== `${snapshot.baseSha}\n`) reject();
    } catch (error) {
        if (error instanceof SddSourceContextFailure) throw error;
        reject();
    }
}
