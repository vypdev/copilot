import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import type { BugbotReviewSourcePort } from '../../application/ports/bugbot_review_source_ports';
import type { BugbotPullRequestIdentity } from '../../domain/bugbot/context';
import type { PullRequestReviewDiffSnapshot } from '../../application/ports/bugbot_pull_request_read_ports';
import { BUGBOT_FRAMED_LIMITS, BugbotReviewCompletenessError, enforceBugbotFramedBudget,
    type BugbotFramedResource,
    type BugbotFramedChange, type BugbotFramedReviewSource, type BugbotFramedReviewIdentity,
    type BugbotReviewGitEntry as GitEntry } from '../../domain/bugbot/framed_review';
import { validateBugbotFramedChange, validateBugbotFramedIdentity } from '../../application/policies/bugbot_framed_review_policy';
import { bugbotPatchBindsText } from '../../application/policies/bugbot_patch_binding_policy';
import { fileMatchesIgnorePatterns } from '../../application/policies/file_ignore_policy';
import { canonicalGitObjectId } from '../../domain/git_object_id';

/** Immutable source proof for every required side, not just the missing provider patches. */
export class BugbotGitReviewSourceAdapter implements BugbotReviewSourcePort {
    constructor(private readonly root = process.cwd()) {}
    async readCompleteSource(pr: BugbotPullRequestIdentity, snapshot: PullRequestReviewDiffSnapshot,
        enumerationComplete: boolean, ignores: readonly string[]): Promise<BugbotFramedReviewSource> {
        try {
            if (!enumerationComplete || !Array.isArray(snapshot.changes)) throw new BugbotReviewCompletenessError('coverage');
            const initial: BugbotFramedReviewIdentity = {
                owner: pr.baseRepository.owner, repository: pr.baseRepository.name,
                ...(pr.baseRepository.id === undefined ? {} : { repositoryId: pr.baseRepository.id }),
                pullRequestNumber: pr.number, baseSha: pr.baseRefSha!, baseRef: pr.baseRef!,
                headOwner: pr.headRepositoryOwner, headRepository: pr.headRepositoryName!,
                headRef: pr.headRef, headSha: pr.headSha, mergeBaseSha: pr.baseRefSha!,
            };
            validateBugbotFramedIdentity(initial);
            if (pr.state !== 'open' || !Number.isSafeInteger(pr.changedFileCount)
                || pr.changedFileCount !== snapshot.changes.length) throw new BugbotReviewCompletenessError('coverage');
            enforceBugbotFramedBudget('files', snapshot.changes.length);
            const changes: BugbotFramedChange[] = snapshot.changes.map(change => ({ ...change, source: 'provider' }));
            const names = new Set<string>();
            for (const change of changes) {
                validateBugbotFramedChange(change);
                if (names.has(change.filename)) throw new BugbotReviewCompletenessError('coverage');
                names.add(change.filename);
            }
            const selected = changes.filter(change => !fileMatchesIgnorePatterns(change.filename, ignores));
            enforceBugbotFramedBudget('recoveredFiles', selected.filter(c => !completeTextPatch(c.patch, c.additions, c.deletions)).length);
            enforceBugbotFramedBudget('rawUtf16', selected.reduce((sum, change) => sum + change.patch.length, 0));
            const root = await realpath(resolve(this.root));
            const git = new LocalReviewGitReader(root);
            if (await realpath(decode(await git.read(['rev-parse', '--show-toplevel'], 16_384)).trim()) !== root) throw new BugbotReviewCompletenessError('identity');
            if (decode(await git.read(['rev-parse', '--is-shallow-repository'], 256)).trim() !== 'false') throw new BugbotReviewCompletenessError('source');
            const format = decode(await git.read(['rev-parse', '--show-object-format'], 256)).trim();
            if (format !== (initial.headSha.length === 40 ? 'sha1' : 'sha256')) throw new BugbotReviewCompletenessError('identity');
            for (const sha of [initial.baseSha, initial.headSha]) {
                if (decode(await git.read(['rev-parse', '--verify', `${sha}^{commit}`], 256)).trim() !== sha) throw new BugbotReviewCompletenessError('identity');
            }
            const bases = decode(await git.read(['merge-base', '--all', initial.baseSha, initial.headSha], 16_384)).trim().split('\n');
            if (bases.length !== 1 || canonicalGitObjectId(bases[0]) !== bases[0]) throw new BugbotReviewCompletenessError('identity');
            const identity = Object.freeze({ ...initial, mergeBaseSha: bases[0] });
            validateBugbotFramedIdentity(identity);
            await verifyInventory(git, identity, changes);
            const paths = [...new Set(selected.flatMap(c => [c.filename, ...(c.previousFilename ? [c.previousFilename] : [])]))];
            const oldTree = await readTree(git, identity.mergeBaseSha, paths);
            const newTree = await readTree(git, identity.headSha, paths);
            const sides = selected.map(change => {
                const oldPath = change.status === 'renamed' ? change.previousFilename! : change.filename;
                const old = oldTree.get(oldPath), current = newTree.get(change.filename);
                if ((['added', 'copied'].includes(change.status) && (old || !current))
                    || (change.status === 'removed' && (!old || current))
                    || (!['added', 'copied', 'removed'].includes(change.status) && (!old || !current))
                    || (change.status === 'renamed' && newTree.has(oldPath))) throw new BugbotReviewCompletenessError('source');
                return { change, oldPath, old, current };
            });
            const objects = [...new Set(sides.flatMap(side => [side.old?.oid, side.current?.oid].filter((id): id is string => Boolean(id))))];
            const blobs = await readBlobs(git, objects);
            let recovered = 0, patchBytes = 0, rawUnits = 0;
            for (const side of sides) {
                const { change, oldPath, old, current } = side;
                const before = old ? blobs.get(old.oid)! : '', after = current ? blobs.get(current.oid)! : '';
                let patch = change.patch, source: BugbotFramedChange['source'] = 'provider';
                if (!completeTextPatch(patch, change.additions, change.deletions) || !bugbotPatchBindsText(patch, before, after)) {
                    enforceBugbotFramedBudget('recoveredFiles', ++recovered);
                    const comparison = old && current ? [old.oid, current.oid] : [identity.mergeBaseSha, identity.headSha, '--', change.filename];
                    const diff = decode(await git.read(['diff', '--no-ext-diff', '--no-textconv', '--text', '--no-renames',
                        '--no-color', '--no-relative', '--diff-algorithm=myers', '--no-indent-heuristic', '--unified=3', ...comparison], 2 * 1024 * 1024 + 16_384, undefined, 'recoveredPatchBytes'));
                    const start = diff.search(/^@@ -[0-9]/mu);
                    patch = start < 0 ? JSON.stringify({ kind: 'verified-metadata-only', oldPath, path: change.filename, old: old ?? null, current: current ?? null }) : diff.slice(start);
                    if (start < 0 ? change.additions !== 0 || change.deletions !== 0 || before !== after
                        : !completeTextPatch(patch, change.additions, change.deletions) || !bugbotPatchBindsText(patch, before, after)) throw new BugbotReviewCompletenessError('source');
                    enforceBugbotFramedBudget('recoveredPatchBytes', Buffer.byteLength(patch));
                    patchBytes += Buffer.byteLength(patch); enforceBugbotFramedBudget('recoveredPatchTotalBytes', patchBytes);
                    source = 'local-git';
                }
                rawUnits += patch.length; enforceBugbotFramedBudget('rawUtf16', rawUnits);
                changes[changes.indexOf(change)] = Object.freeze({ ...change, patch, source,
                    git: Object.freeze({ ...(old ? { old: Object.freeze(old) } : {}), ...(current ? { current: Object.freeze(current) } : {}) }) });
            }
            return Object.freeze({ identity, complete: true,
                metrics: Object.freeze({ gitReads: git.operationCount, verifiedBlobs: blobs.size,
                    verifiedBlobBytes: [...blobs.values()].reduce((sum, value) => sum + Buffer.byteLength(value), 0),
                    recoveredFiles: recovered, recoveredPatchBytes: patchBytes }), changes: Object.freeze(changes.map(change => Object.freeze(change))) });
        } catch (error) {
            if (error instanceof BugbotReviewCompletenessError) throw error;
            throw new BugbotReviewCompletenessError('source');
        }
    }
}

/** Independent immutable changed-path inventory closes omission and mutable-page ABA gaps. */
async function verifyInventory(git: LocalReviewGitReader, id: BugbotFramedReviewIdentity, changes: readonly BugbotFramedChange[]): Promise<void> {
    const raw = decode(await git.read(['diff', '--no-ext-diff', '--no-textconv', '--raw', '-z', '--no-abbrev', '--no-renames', id.mergeBaseSha, id.headSha, '--'], 4 * 1024 * 1024));
    const fields = raw.split('\0');
    if (fields.pop() !== '' || fields.length % 2) throw new BugbotReviewCompletenessError('coverage');
    const allowed = new Set(changes.flatMap(c => [c.filename, ...(c.status === 'renamed' && c.previousFilename ? [c.previousFilename] : [])]));
    const actual = new Set<string>();
    for (let index = 0; index < fields.length; index += 2) {
        if (!/^:[0-7]{6} [0-7]{6} (?:[a-f0-9]{40}|[a-f0-9]{64}) (?:[a-f0-9]{40}|[a-f0-9]{64}) [A-Z]$/u.test(fields[index])
            || !allowed.has(fields[index + 1]) || actual.has(fields[index + 1])) throw new BugbotReviewCompletenessError('coverage');
        actual.add(fields[index + 1]);
    }
    if (changes.some(c => !actual.has(c.filename))) throw new BugbotReviewCompletenessError('coverage');
}
async function readTree(git: LocalReviewGitReader, sha: string, paths: readonly string[]): Promise<Map<string, GitEntry>> {
    const result = new Map<string, GitEntry>();
    for (let offset = 0; offset < paths.length;) {
        const batch: string[] = []; let characters = 0;
        while (offset < paths.length && batch.length < 16 && characters + paths[offset].length + 1 <= 12_000) {
            characters += paths[offset].length + 1; batch.push(paths[offset++]);
        }
        const assigned = new Set(batch);
        for (const line of decode(await git.read(['ls-tree', '--full-tree', '-z', sha, '--', ...batch], 32_768)).split('\0').filter(Boolean)) {
            const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/u.exec(line);
            if (!match || !assigned.has(match[3]) || result.has(match[3])) throw new BugbotReviewCompletenessError('source');
            result.set(match[3], { mode: match[1] as GitEntry['mode'], oid: match[2] });
        }
    }
    return result;
}
async function readBlobs(git: LocalReviewGitReader, ids: readonly string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!ids.length) return result;
    const input = ids.join('\n') + '\n';
    const sizes = decode(await git.read(['cat-file', '--batch-check'], 512 * 1024, input)).trimEnd().split('\n');
    if (sizes.length !== ids.length) throw new BugbotReviewCompletenessError('source');
    let total = 0;
    const lengths = sizes.map((line, index) => {
        const parts = /^([a-f0-9]{40}|[a-f0-9]{64}) blob (0|[1-9][0-9]*)$/u.exec(line);
        if (!parts || parts[1] !== ids[index]) throw new BugbotReviewCompletenessError('source');
        const size = Number(parts[2]); enforceBugbotFramedBudget('blobBytes', size);
        total += size; enforceBugbotFramedBudget('blobTotalBytes', total); return size;
    });
    const data = await git.read(['cat-file', '--batch'], total + 512 * 1024, input);
    let offset = 0;
    for (const [index, oid] of ids.entries()) {
        const end = data.indexOf(10, offset);
        if (end < 0 || decode(data.subarray(offset, end)) !== `${oid} blob ${lengths[index]}`) throw new BugbotReviewCompletenessError('source');
        const body = data.subarray(end + 1, end + 1 + lengths[index]);
        offset = end + 1 + lengths[index] + 1;
        if (body.length !== lengths[index] || data[offset - 1] !== 10 || body.includes(0)
            || createHash(oid.length === 40 ? 'sha1' : 'sha256').update(`blob ${body.length}\0`).update(body).digest('hex') !== oid) throw new BugbotReviewCompletenessError('source');
        result.set(oid, decode(body));
    }
    if (offset !== data.length) throw new BugbotReviewCompletenessError('source');
    return result;
}
function decode(bytes: Buffer): string {
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new BugbotReviewCompletenessError('source'); }
}
class LocalReviewGitReader {
    private reads = 0;
    constructor(private readonly root: string) {}
    get operationCount(): number { return this.reads; }
    async read(args: readonly string[], maxBuffer: number, input?: string, overflow?: BugbotFramedResource): Promise<Buffer> {
        enforceBugbotFramedBudget('gitReads', ++this.reads);
        const safe = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].includes(key.toUpperCase())));
        const devNull = process.platform === 'win32' ? 'NUL' : '/dev/null';
        return new Promise((resolveResult, reject) => {
            const childProcess = execFile('git', ['--no-optional-locks', '--no-replace-objects', '--no-lazy-fetch', '--literal-pathspecs',
                '-c', 'protocol.allow=never', '-c', `core.attributesFile=${devNull}`, '-c', `core.hooksPath=${devNull}`, ...args], {
                cwd: this.root, encoding: 'buffer', windowsHide: true, timeout: 30_000, maxBuffer,
                env: { ...safe, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_ATTR_NOSYSTEM: '1',
                    GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', LANG: 'C' },
            }, (error, stdout) => {
                if (error && overflow && error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' && error.message.includes('stdout')) {
                    reject(new BugbotReviewCompletenessError(overflow, BUGBOT_FRAMED_LIMITS[overflow] + 1, BUGBOT_FRAMED_LIMITS[overflow], 'UTF-8 bytes', 'at-least'));
                } else if (error) reject(new BugbotReviewCompletenessError('source'));
                else resolveResult(stdout);
            });
            childProcess.stdin?.on('error', () => { /* A rejected command is reported by its bounded callback. */ });
            childProcess.stdin?.end(input);
        });
    }
}
/** Checks declared hunk completeness and native counts; absent/truncated/binary metadata is not text evidence. */
export function completeTextPatch(patch: string, additions: number, deletions: number): boolean {
    let oldRemaining = 0, newRemaining = 0, added = 0, removed = 0, hunks = 0;
    for (const line of patch.split('\n')) {
        const header = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/u.exec(line);
        if (header) {
            if (oldRemaining || newRemaining) return false;
            oldRemaining = header[1] === undefined ? 1 : Number(header[1]);
            newRemaining = header[2] === undefined ? 1 : Number(header[2]);
            hunks++; continue;
        }
        if (line === '\\ No newline at end of file') continue;
        if (line === '' && oldRemaining === 0 && newRemaining === 0) continue;
        if (hunks === 0) return false;
        if (line.startsWith('+')) { added++; newRemaining--; }
        else if (line.startsWith('-')) { removed++; oldRemaining--; }
        else if (line.startsWith(' ')) { oldRemaining--; newRemaining--; }
        else return false;
        if (oldRemaining < 0 || newRemaining < 0) return false;
    }
    return hunks > 0 && oldRemaining === 0 && newRemaining === 0 && added === additions && removed === deletions;
}

