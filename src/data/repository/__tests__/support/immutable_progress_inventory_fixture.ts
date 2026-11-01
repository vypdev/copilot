import { createHash } from 'node:crypto';
import type { GithubProgressObjectClient } from '../../../../infrastructure/github/ports/github_progress_object_provider_port';
import { ProgressDiffRepository } from '../../progress_diff_repository';
export const inventoryBase = 'a'.repeat(40), inventoryHead = 'b'.repeat(40);
export type SourceFile = string | { bytes: Buffer; mode?: string; type?: string };
type Entry = Awaited<ReturnType<GithubProgressObjectClient['rest']['git']['getTree']>>['data']['tree'][number];
export function gitObject(kind: string, bytes: Buffer): string { return createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex'); }
export function directoryHash(entries: readonly Entry[]): string {
    const sorted = [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.path! + (a.type === 'tree' ? '/' : '')), Buffer.from(b.path! + (b.type === 'tree' ? '/' : ''))));
    return gitObject('tree', Buffer.concat(sorted.map(entry => Buffer.concat([Buffer.from(`${entry.mode!.replace(/^0/u, '')} ${entry.path}\0`), Buffer.from(entry.sha!, 'hex')]))));
}
export function inventoryFixture(before: Readonly<Record<string, SourceFile>> = {}, after: Readonly<Record<string, SourceFile>> = {}) {
    const trees = new Map<string, Entry[]>(), blobs = new Map<string, Buffer>();
    const build = (files: Readonly<Record<string, SourceFile>>): string => {
        const directories = new Map<string, Entry[]>(); directories.set('', []);
        for (const [path, source] of Object.entries(files)) {
            const parts = path.split('/'), name = parts.pop()!, parent = parts.join('/');
            let current = '';
            for (const part of parts) { current = current ? current + '/' + part : part; if (!directories.has(current)) directories.set(current, []); }
            const value = typeof source === 'string' ? { bytes: Buffer.from(source) } : source;
            const sha = gitObject('blob', value.bytes); blobs.set(sha, value.bytes);
            directories.get(parent)!.push({ path: name, type: value.type ?? 'blob', mode: value.mode ?? '100644', sha, size: value.bytes.length });
        }
        for (const path of [...directories.keys()].sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length)) {
            const entries = directories.get(path)!; const sha = directoryHash(entries); trees.set(sha, entries);
            if (!path) return sha;
            const parts = path.split('/'), name = parts.pop()!;
            directories.get(parts.join('/'))!.push({ path: name, type: 'tree', mode: '040000', sha });
        }
        throw new Error('fixture root absent');
    };
    const baseTree = build(before), headTree = build(after);
    const getCommit = jest.fn(async ({ commit_sha }: Record<string, unknown>) => ({ data: { sha: commit_sha as string, tree: { sha: commit_sha === inventoryBase ? baseTree : headTree } } }));
    const getTree = jest.fn(async ({ tree_sha }: Record<string, unknown>) => ({ data: { sha: tree_sha as string, truncated: false, tree: trees.get(tree_sha as string)! } }));
    const getBlob = jest.fn(async ({ file_sha }: Record<string, unknown>) => {
        const bytes = blobs.get(file_sha as string)!;
        return { data: { sha: file_sha as string, encoding: 'base64', size: bytes.length, content: bytes.toString('base64') } };
    });
    const client: GithubProgressObjectClient = { rest: { git: { getCommit, getTree, getBlob } } };
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]).sort();
    const files = changed.slice(0, 300).map(filename => ({ filename, status: !(filename in before) ? 'added' : !(filename in after) ? 'removed' : 'modified',
        additions: 1, deletions: 0, patch: 'UNTRUSTED_PREFIX_PATCH', raw_url: 'PRIVATE_URL', blob_url: 'PRIVATE_URL', contents_url: 'PRIVATE_URL' }));
    const data = { base_commit: { sha: inventoryBase }, merge_base_commit: { sha: inventoryBase }, ahead_by: 1, behind_by: 0, total_commits: 1, files, commits: [] };
    const compareCommits = jest.fn(async () => ({ data }));
    const repo = new ProgressDiffRepository({ getClient: () => ({ rest: { repos: { compareCommits } } }) }, { getClient: () => client });
    return { client, getCommit, getTree, getBlob, baseTree, headTree, trees, blobs, data, compareCommits,
        read: () => repo.getDiff('acme', 'demo', inventoryBase, inventoryHead, 'PRIVATE_TOKEN') };
}
export function addedFiles(count = 301): Record<string, string> { return Object.fromEntries(Array.from({ length: count }, (_, n) => [`src/file-${String(n).padStart(4, '0')}.ts`, `export const value${n} = ${n};\n`])); }
