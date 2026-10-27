import { createHash } from 'node:crypto';
import type { GithubProgressObjectClient } from '../../../../infrastructure/github/ports/github_progress_object_provider_port';
export const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), MERGE_BASE = 'c'.repeat(40);
export type FileMap = Record<string, string | Buffer | { text: string; mode: string }>;
export const blobSha = (bytes: Buffer) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
export function objectFixture(before: FileMap = {}, after: FileMap = {}) {
    type Tree = Awaited<ReturnType<GithubProgressObjectClient['rest']['git']['getTree']>>['data'];
    type Blob = Awaited<ReturnType<GithubProgressObjectClient['rest']['git']['getBlob']>>['data'];
    const trees = new Map<string, Tree>(), blobs = new Map<string, Blob>(), roots = new Map<string, string>();
    for (const [commit, files] of [[BASE, before], [MERGE_BASE, before], [HEAD, after]] as const) {
        const directories = new Map<string, string>();
        const directory = (path: string): string => {
            if (directories.has(path)) return directories.get(path)!;
            const sha = createHash('sha1').update(commit + path).digest('hex'); directories.set(path, sha);
            trees.set(sha, { sha, truncated: false, tree: [] });
            if (path) { const segments = path.split('/'); const name = segments.pop()!;
                trees.get(directory(segments.join('/')))!.tree.push({ path: name, sha, mode: '040000', type: 'tree' }); }
            return sha;
        };
        roots.set(commit, directory(''));
        for (const [path, value] of Object.entries(files)) {
            const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : value.text);
            const mode = typeof value === 'object' && !Buffer.isBuffer(value) ? value.mode : '100644';
            const sha = blobSha(bytes); blobs.set(sha, { sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') });
            const segments = path.split('/'), name = segments.pop()!;
            trees.get(directory(segments.join('/')))!.tree.push({ path: name, sha, mode, size: bytes.length, type: 'blob' });
        }
    }
    const getCommit = jest.fn(async ({ commit_sha }: Record<string, unknown>) => ({ data: { sha: String(commit_sha), tree: { sha: roots.get(String(commit_sha))! } } }));
    const getTree = jest.fn(async ({ tree_sha }: Record<string, unknown>) => ({ data: trees.get(String(tree_sha))! }));
    const getBlob = jest.fn(async ({ file_sha }: Record<string, unknown>) => ({ data: blobs.get(String(file_sha))! }));
    return { client: { rest: { git: { getCommit, getTree, getBlob } } }, getCommit, getTree, getBlob, trees, blobs, roots };
}
