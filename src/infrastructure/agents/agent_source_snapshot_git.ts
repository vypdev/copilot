import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentCliError } from '../../data/repository/agent_cli_contracts';
import { SddSourceContextFailure, type AgentSourceSnapshot, type SddSourceContextReason } from '../../domain/agent_source_snapshot';
import { isSourceSnapshotPath, sourceSnapshotPathKey, SOURCE_SNAPSHOT_LIMITS as LIMIT } from '../../application/policies/agent_source_snapshot_policy';

export interface SourceSnapshotFile {
    readonly path: string;
    readonly objectId: string;
    readonly mode: '100644' | '100755';
    readonly bytes: number;
}
export interface SourceSnapshotInventory {
    readonly treeSha: string;
    readonly files: readonly SourceSnapshotFile[];
    readonly directories: readonly string[];
    readonly objects: readonly string[];
    readonly bytes: number;
}
const SHA = /^[a-f0-9]{40}$/u;

/** Decodes native object metadata, never a working checkout or model-selected path list. */
export function readSourceSnapshotInventory(raw: Buffer, treeSha: string, source: AgentSourceSnapshot): SourceSnapshotInventory {
    const reject = (reason: ConstructorParameters<typeof SddSourceContextFailure>[0]): never => { throw new SddSourceContextFailure(reason, source); };
    if (raw.length > LIMIT.inventoryBytes) reject('metadata-limit');
    const text = raw.toString('utf8');
    if (!SHA.test(treeSha) || !Buffer.from(text, 'utf8').equals(raw) || (text !== '' && !text.endsWith('\0'))) reject('object-unavailable');
    const records = text === '' ? [] : text.slice(0, -1).split('\0');
    if (records.length > LIMIT.entries) reject('entry-limit');
    const files: SourceSnapshotFile[] = [], directories: string[] = [], objects = new Set([source.baseSha, treeSha]), names = new Set<string>();
    let bytes = 0;
    for (const record of records) {
        const tab = record.indexOf('\t'), name = record.slice(tab + 1), fields = record.slice(0, tab).trim().split(/\s+/u);
        if (tab < 0 || fields.length !== 4 || !SHA.test(fields[2])) reject('object-unavailable');
        if (!isSourceSnapshotPath(name) || names.has(sourceSnapshotPathKey(name))) reject('unsafe-entry');
        names.add(sourceSnapshotPathKey(name)); objects.add(fields[2]);
        if (fields[0] === '040000' && fields[1] === 'tree' && fields[3] === '-') { directories.push(name); continue; }
        if (!['100644', '100755'].includes(fields[0]) || fields[1] !== 'blob') reject('unsafe-entry');
        const size = Number(fields[3]);
        if (!/^\d+$/u.test(fields[3]) || !Number.isSafeInteger(size)) reject('object-unavailable');
        if (size > LIMIT.blobBytes) reject('blob-limit');
        bytes += size;
        if (bytes > LIMIT.totalBytes) reject('byte-limit');
        files.push(Object.freeze({ path: name, objectId: fields[2], mode: fields[0] as SourceSnapshotFile['mode'], bytes: size }));
        if (files.length > LIMIT.files) reject('file-limit');
    }
    return Object.freeze({ treeSha, files: Object.freeze(files), directories: Object.freeze(directories), objects: Object.freeze([...objects].sort()), bytes });
}

/** Credential-free local object operations; no fetch, checkout, shared worktree, hooks or filters. */
export class SourceSnapshotGit {
    private readonly environment: NodeJS.ProcessEnv;
    readonly emptyTemplate: string;
    constructor(private readonly source: AgentSourceSnapshot, runtimeDirectory: string, private readonly deadline: number,
        private readonly signal?: AbortSignal) {
        const profile = join(runtimeDirectory, 'source-git-profile');
        this.emptyTemplate = join(profile, 'template');
        mkdirSync(this.emptyTemplate, { recursive: true, mode: 0o700 });
        const config = join(profile, 'global.config'); writeFileSync(config, '', { flag: 'wx', mode: 0o600 });
        // Windows/Jest worker environments may preserve Path/SystemRoot casing as plain object keys.
        const inherited = process.platform === 'win32'
            ? Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key.toUpperCase(), value])) : process.env;
        this.environment = Object.fromEntries(['PATH', 'SYSTEMROOT', 'WINDIR', 'PATHEXT', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL']
            .filter(key => inherited[key] !== undefined).map(key => [key, inherited[key]]));
        this.environment = { ...this.environment, HOME: profile, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1',
            GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' };
        // An unsupported Git must fail closed before reading any consumer objects.
        this.run(runtimeDirectory, ['--version'], undefined, 1024, 'git-unavailable');
    }
    remaining(): number {
        if (this.signal?.aborted) throw new AgentCliError('The read-only source preparation was cancelled.', 'cancelled');
        const remaining = Math.ceil(this.deadline - performance.now());
        if (remaining <= 0) throw new AgentCliError('The read-only source preparation exhausted its operation deadline.', 'timeout', true);
        return remaining;
    }
    run(root: string, args: readonly string[], input?: Buffer, maximum = LIMIT.inventoryBytes,
        failureReason: SddSourceContextReason = 'object-unavailable'): Buffer {
        const timeout = this.remaining();
        try {
            return execFileSync('git', ['--no-lazy-fetch', '--no-replace-objects', '-c', `core.hooksPath=${this.emptyTemplate}`,
                '-c', 'core.fsmonitor=false', ...args], { cwd: root, env: this.environment, input,
                timeout, maxBuffer: maximum, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ETIMEDOUT') {
                throw new AgentCliError('The read-only source preparation exhausted its operation deadline.', 'timeout', true);
            }
            if ((error as NodeJS.ErrnoException)?.code === 'ENOBUFS') throw new SddSourceContextFailure('metadata-limit', this.source);
            throw new SddSourceContextFailure(failureReason, this.source);
        }
    }
    inventory(anchor: string): SourceSnapshotInventory {
        if (this.run(anchor, ['cat-file', '-t', this.source.baseSha]).toString().trim() !== 'commit') {
            throw new SddSourceContextFailure('object-unavailable', this.source);
        }
        const size = Number(this.run(anchor, ['cat-file', '-s', this.source.baseSha]).toString().trim());
        if (!Number.isSafeInteger(size) || size <= 0 || size > LIMIT.commitBytes) throw new SddSourceContextFailure('metadata-limit', this.source);
        const tree = this.run(anchor, ['rev-parse', '--verify', `${this.source.baseSha}^{tree}`]).toString().trim();
        return readSourceSnapshotInventory(this.run(anchor, ['ls-tree', '-r', '-t', '-l', '-z', '--full-tree', this.source.baseSha]), tree, this.source);
    }
    seed(anchor: string, workspace: string, inventory: SourceSnapshotInventory): void {
        this.run(workspace, ['init', '--quiet', `--template=${this.emptyTemplate}`], undefined, LIMIT.inventoryBytes, 'materialization-failed');
        const metadata = join(workspace, '.git');
        writeFileSync(join(metadata, 'shallow'), `${this.source.baseSha}\n`, { mode: 0o600, flag: 'wx' });
        const packed = this.run(anchor, ['pack-objects', '--stdout', '--window=0', '--threads=1'], Buffer.from(`${inventory.objects.join('\n')}\n`), LIMIT.packedBytes);
        this.run(workspace, ['index-pack', '--stdin', '--strict', '--threads=1', `--max-input-size=${LIMIT.packedBytes}`], packed, LIMIT.inventoryBytes, 'materialization-failed');
        writeFileSync(join(metadata, 'HEAD'), `${this.source.baseSha}\n`, { mode: 0o600 });
        this.run(workspace, ['read-tree', this.source.baseSha], undefined, LIMIT.inventoryBytes, 'materialization-failed');
        for (const [name, value] of [['core.autocrlf', 'false'], ['core.longpaths', 'true'], ['core.fsmonitor', 'false'], ['core.hooksPath', this.emptyTemplate]]) {
            this.run(workspace, ['config', '--local', name, value], undefined, LIMIT.inventoryBytes, 'materialization-failed');
        }
        mkdirSync(join(metadata, 'info'), { mode: 0o700, recursive: true });
        writeFileSync(join(metadata, 'info', 'attributes'), '* -text -ident -filter -working-tree-encoding\n', { flag: 'wx', mode: 0o600 });
    }
    blobs(workspace: string, files: readonly SourceSnapshotFile[]): ReadonlyMap<string, Buffer> {
        const unique = new Map(files.map(file => [file.objectId, file.bytes]));
        const output = this.run(workspace, ['cat-file', '--batch'], Buffer.from([...unique.keys()].map(id => `${id}\n`).join('')), LIMIT.packedBytes);
        const blobs = new Map<string, Buffer>(); let cursor = 0;
        for (const [id, size] of unique) {
            const newline = output.indexOf(10, cursor), header = output.subarray(cursor, newline).toString();
            const body = output.subarray(newline + 1, newline + 1 + size);
            if (newline < cursor || header !== `${id} blob ${size}` || body.length !== size || output[newline + 1 + size] !== 10
                || gitBlobId(body) !== id) throw new SddSourceContextFailure('object-unavailable', this.source);
            blobs.set(id, body); cursor = newline + size + 2;
        }
        if (cursor !== output.length) throw new SddSourceContextFailure('object-unavailable', this.source);
        return blobs;
    }
}

export function gitBlobId(value: Buffer): string {
    return createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
}
