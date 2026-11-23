import { createHash } from 'node:crypto';
import { batchObject, batchSha, SetupBatchGithubTransport, SetupBatchProviderError } from './setup_batch_github_read_adapter';

export interface SetupPublisherGitEntry {
  readonly path: string;
  readonly mode: string;
  readonly type: string;
  readonly sha: string;
  readonly size?: number;
}

/** Complete nonrecursive immutable reads. No resource inventory or write capability. */
export class SetupPublisherGitReader {
  readonly #token: string;
  private readonly trees = new Map<string, readonly SetupPublisherGitEntry[]>();
  constructor(private readonly transport: SetupBatchGithubTransport, token: string,
    private readonly repository: { readonly owner: string; readonly repo: string }) { this.#token = token; }

  async commitTree(commit: string): Promise<string> {
    if (!batchSha(commit)) throw new SetupBatchProviderError('malformed');
    const data = batchObject(await this.transport.call(this.#token, 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
      { ...this.repository, commit_sha: commit }));
    const tree = batchObject(data?.tree)?.sha;
    if (data?.sha !== commit || !batchSha(tree)) throw new SetupBatchProviderError('malformed');
    return tree;
  }

  async tree(sha: string): Promise<readonly SetupPublisherGitEntry[]> {
    if (!batchSha(sha)) throw new SetupBatchProviderError('malformed');
    const cached = this.trees.get(sha); if (cached) return cached;
    const data = batchObject(await this.transport.call(this.#token, 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}',
      { ...this.repository, tree_sha: sha }));
    if (data?.sha !== sha || data.truncated !== false || !Array.isArray(data.tree) || data.tree.length > 100_000) {
      throw new SetupBatchProviderError('malformed');
    }
    const names = new Set<string>();
    const entries = data.tree.map((raw): SetupPublisherGitEntry => {
      const item = batchObject(raw);
      if (!item || typeof item.path !== 'string' || !item.path || /[/\p{Cc}\p{Cf}]/u.test(item.path)
        || item.path === '.' || item.path === '..' || names.has(item.path) || !batchSha(item.sha)
        || !(item.type === 'tree' && item.mode === '040000' || item.type === 'blob'
          && ['100644', '100755', '120000'].includes(String(item.mode)) && Number.isSafeInteger(item.size) && Number(item.size) >= 0
          || item.type === 'commit' && item.mode === '160000')) throw new SetupBatchProviderError('malformed');
      names.add(item.path);
      return Object.freeze({ path: item.path, type: item.type as string, mode: item.mode as string, sha: item.sha,
        ...(item.type === 'blob' ? { size: item.size as number } : {}) });
    });
    const result = Object.freeze(entries); this.trees.set(sha, result); return result;
  }

  /** Null means proven absence in a complete tree, never a failed read. */
  async find(root: string, path: string): Promise<SetupPublisherGitEntry | null> {
    const parts = path.split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || /[\\\p{Cc}\p{Cf}]/u.test(part))) {
      throw new SetupBatchProviderError('malformed');
    }
    let tree = root;
    for (const name of parts.slice(0, -1)) {
      const entry = await this.child(tree, name);
      if (!entry) return null;
      if (entry.type !== 'tree' || entry.mode !== '040000') throw new SetupBatchProviderError('malformed');
      tree = entry.sha;
    }
    return this.child(tree, parts[parts.length - 1]);
  }

  private async child(tree: string, name: string): Promise<SetupPublisherGitEntry | null> {
    const matches = (await this.tree(tree)).filter(entry => entry.path.toLowerCase() === name.toLowerCase());
    if (matches.length === 0) return null;
    if (matches.length !== 1 || matches[0].path !== name) throw new SetupBatchProviderError('malformed');
    return matches[0];
  }

  async text(entry: SetupPublisherGitEntry, maxBytes: number): Promise<string> {
    // Source bundles use the provider's documented 100 MB blob ceiling.
    // Destination callers retain their existing 100,000-byte asset limit.
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || !batchSha(entry.sha)
      || !Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 100_000_000
      || !Number.isSafeInteger(entry.size) || entry.size! < 0 || entry.size! > maxBytes) throw new SetupBatchProviderError('malformed');
    const data = batchObject(await this.transport.call(this.#token, 'GET /repos/{owner}/{repo}/git/blobs/{file_sha}',
      { ...this.repository, file_sha: entry.sha }));
    if (data?.sha !== entry.sha || data.size !== entry.size || data.encoding !== 'base64' || typeof data.content !== 'string'
      || data.content.length > 4 * Math.ceil(maxBytes / 3) + Math.ceil(4 * Math.ceil(maxBytes / 3) / 60) * 2) {
      throw new SetupBatchProviderError('malformed');
    }
    const encoded = data.content.replace(/\r?\n/gu, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) throw new SetupBatchProviderError('malformed');
    const bytes = Buffer.from(encoded, 'base64'), text = bytes.toString('utf8');
    const oid = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (bytes.length !== entry.size || bytes.toString('base64') !== encoded || !Buffer.from(text, 'utf8').equals(bytes)
      || oid !== entry.sha) throw new SetupBatchProviderError('malformed');
    return text;
  }
}
