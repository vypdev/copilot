import { logInfo } from '../../application/ports/logging_ports';
import { isProgressEvidencePath as safeProgressPath, renderProgressEvidencePath } from '../../domain/progress_evidence_path';
export { safeProgressPath };
import { createHash } from 'node:crypto';
import type { ProgressRecoveryUsage } from '../../application/ports/progress_diff_query_ports';
import { initialProgressRecoveryUsage, spendProgressRecovery, ProgressRecoveryCapacityFailure,
    MAX_FRAMED_PROGRESS_FILE_BYTES, MAX_PROGRESS_RECOVERY_FRAMES, PROGRESS_RECOVERY_TOTAL_LIMITS,
    type ProgressRecoveryResource } from '../../application/policies/progress_recovery_capacity_policy';
import type { GithubProgressObjectClient } from '../../infrastructure/github/ports/github_progress_object_provider_port';
import { MAX_PROGRESS_OBJECT_REQUESTS, MAX_PROGRESS_RECOVERED_BYTES, MAX_PROGRESS_RECOVERED_FILE_BYTES, MAX_PROGRESS_TREE_ENTRIES,
    progressRecoveryError, progressBinaryEvidenceUnavailable, type ProgressContentSnapshot, type RecoveredProgressContent } from '../../application/policies/progress_content_evidence_policy';

const oid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
type Entry = Awaited<ReturnType<GithubProgressObjectClient['rest']['git']['getTree']>>['data']['tree'][number];

/** Invocation-local recovery, with no mutable ref, checkout, clone, subprocess or provider URL access. */
export class ImmutableProgressContentRepository {
    private requests = 0;
    private entries = 0;
    private bytes = 0;
    private readonly commits = new Map<string, string>();
    private readonly trees = new Map<string, readonly Entry[]>();
    private readonly blobs = new Map<string, string>();
    private framedUsage?: ProgressRecoveryUsage;
    constructor(private readonly client: GithubProgressObjectClient, private readonly owner: string, private readonly repo: string,
        profile: 'legacy' | 'framed-v1' = 'legacy') {
        if (profile === 'framed-v1') this.framedUsage = initialProgressRecoveryUsage();
        else if (profile !== 'legacy') throw progressRecoveryError('unsupported recovery capacity profile', []);
    }

    get usage(): ProgressRecoveryUsage | undefined { return this.framedUsage; }

    private spend(resource: ProgressRecoveryResource, amount: number, paths: readonly string[]): boolean {
        if (!this.framedUsage) return false;
        try { this.framedUsage = spendProgressRecovery(this.framedUsage, resource, amount); }
        catch (error) {
            if (!(error instanceof ProgressRecoveryCapacityFailure)) throw error;
            const total = error.usage.total;
            throw progressRecoveryError(`framed ${error.resource} recovery capacity exhausted (${error.reason}); frames ${error.usage.frames}/${MAX_PROGRESS_RECOVERY_FRAMES}, files ${total.files}/${PROGRESS_RECOVERY_TOTAL_LIMITS.files}, bytes ${total.bytes}/${PROGRESS_RECOVERY_TOTAL_LIMITS.bytes}, requests ${total.requests}/${PROGRESS_RECOVERY_TOTAL_LIMITS.requests}, directory entries ${total.treeEntries}/${PROGRESS_RECOVERY_TOTAL_LIMITS.treeEntries}`, paths, true);
        }
        return true;
    }

    async recover(comparisonBaseSha: string, headSha: string, path: string, status: string, previousPath: string | undefined, unreviewed: readonly string[]): Promise<RecoveredProgressContent> {
        const fail = (reason: string, large = false) => progressRecoveryError(reason, unreviewed, large);
        if (!oid(comparisonBaseSha) || !oid(headSha)) throw fail('immutable comparison identity is unavailable');
        const rename = status === 'renamed' || status === 'copied';
        if (rename && !safeProgressPath(previousPath)) throw fail('the previous path is unavailable');
        this.spend('files', 1, unreviewed);
        const basePath = rename ? previousPath! : path;
        const before = await this.entry(comparisonBaseSha, basePath, unreviewed);
        const after = await this.entry(headSha, path, unreviewed);
        if ((status === 'added' && (before || !after)) || (status === 'removed' && (!before || after))
            || (!['added', 'removed'].includes(status) && (!before || !after))) throw fail('immutable file presence disagrees with the comparison');
        const base = before ? await this.snapshot(basePath, before, unreviewed) : undefined;
        const head = after ? await this.snapshot(path, after, unreviewed) : undefined;
        return Object.freeze({ comparisonBaseSha, ...(base ? { base } : {}), ...(head ? { head } : {}) });
    }

    private async request<T>(read: () => Promise<T>, paths: readonly string[]): Promise<T> {
        if (!this.spend('requests', 1, paths) && ++this.requests > MAX_PROGRESS_OBJECT_REQUESTS) throw progressRecoveryError('immutable object request budget exhausted', paths, true);
        try { return await read(); }
        catch (error) {
            if ((error as { status?: unknown })?.status === 404) throw progressRecoveryError('a required immutable object is unavailable', paths);
            throw error; // Genuine authentication/rate-limit/transport failures keep their original classification.
        }
    }

    private async entry(commitSha: string, path: string, paths: readonly string[]): Promise<Entry | undefined> {
        let treeSha = this.commits.get(commitSha);
        if (!treeSha) {
            const { data } = await this.request(() => this.client.rest.git.getCommit({ owner: this.owner, repo: this.repo, commit_sha: commitSha }), paths);
            if (!data || data.sha !== commitSha || !oid(data.tree?.sha)) throw progressRecoveryError('commit identity could not be verified', paths);
            treeSha = data.tree.sha; this.commits.set(commitSha, treeSha);
        }
        const segments = path.split('/');
        let result: Entry | undefined;
        for (const [index, segment] of segments.entries()) {
            let entries = this.trees.get(treeSha);
            if (!entries) {
                const { data } = await this.request(() => this.client.rest.git.getTree({ owner: this.owner, repo: this.repo, tree_sha: treeSha }), paths);
                if (!data || data.sha !== treeSha || data.truncated !== false || !Array.isArray(data.tree)) throw progressRecoveryError('a complete immutable directory is unavailable', paths);
                if (!this.spend('treeEntries', data.tree.length, paths)) {
                    this.entries += data.tree.length;
                    if (this.entries > MAX_PROGRESS_TREE_ENTRIES) throw progressRecoveryError('directory entry budget exhausted', paths, true);
                }
                entries = data.tree; this.trees.set(treeSha, entries);
            }
            const matches = entries.filter(entry => entry.path === segment);
            if (matches.length === 0) return undefined;
            if (matches.length !== 1 || !oid(matches[0].sha)) throw progressRecoveryError('directory identity is ambiguous', paths);
            const entry = matches[0];
            if (index === segments.length - 1) { result = entry; break; }
            if (entry.type !== 'tree' || entry.mode !== '040000') throw progressRecoveryError('a required parent is not a directory', paths);
            treeSha = entry.sha!;
        }
        return result;
    }

    private async snapshot(path: string, entry: Entry, paths: readonly string[]): Promise<ProgressContentSnapshot> {
        if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode!)) throw progressRecoveryError('only regular UTF-8 text files can be recovered', paths);
        if (!Number.isSafeInteger(entry.size) || entry.size! < 0) throw progressRecoveryError('immutable file size is unavailable', paths);
        if (this.framedUsage) {
            if (entry.size! > MAX_FRAMED_PROGRESS_FILE_BYTES) throw progressRecoveryError(`immutable blob exceeds the ${MAX_FRAMED_PROGRESS_FILE_BYTES}-byte framed request limit`, paths, true);
            this.spend('bytes', entry.size!, paths);
        } else {
            this.bytes += entry.size!;
            if (entry.size! > MAX_PROGRESS_RECOVERED_FILE_BYTES || this.bytes > MAX_PROGRESS_RECOVERED_BYTES) throw progressRecoveryError('immutable content byte budget exhausted', paths, true);
        }
        let text = this.blobs.get(entry.sha!);
        if (text === undefined) {
            const { data } = await this.request(() => this.client.rest.git.getBlob({ owner: this.owner, repo: this.repo, file_sha: entry.sha }), paths);
            if (!data || data.sha !== entry.sha || data.size !== entry.size || data.encoding !== 'base64' || typeof data.content !== 'string'
                || data.content.length > Math.ceil(entry.size! / 3) * 4 + Math.ceil(entry.size! / 45) * 2 + 2) throw progressRecoveryError('blob identity, size or encoding is incomplete', paths);
            const encoded = data.content.replace(/[\r\n]/gu, '');
            const bytes = Buffer.from(encoded, 'base64');
            if (bytes.length !== entry.size || bytes.toString('base64') !== encoded
                || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== entry.sha) throw progressRecoveryError('blob bytes do not match their immutable identity', paths);
            text = bytes.toString('utf8');
            if (bytes.includes(0) || !Buffer.from(text, 'utf8').equals(bytes)) {
                paths.forEach((unreviewedPath, index) => logInfo(`Unreviewed progress path ${index + 1} of ${paths.length}: ${renderProgressEvidencePath(unreviewedPath)}`));
                throw progressBinaryEvidenceUnavailable(paths);
            }
            this.blobs.set(entry.sha!, text);
        }
        if (Buffer.byteLength(text, 'utf8') !== entry.size) throw progressRecoveryError('cached blob size disagrees with its directory entry', paths);
        return Object.freeze({ path, sha: entry.sha!, mode: entry.mode!, text });
    }
}
