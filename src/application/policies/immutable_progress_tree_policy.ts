import { createHash } from 'node:crypto';
import { isProgressEvidencePath } from '../../domain/progress_evidence_path';
import { progressInventoryError } from './progress_inventory_error_policy';

export interface ImmutableProgressTreeEntry {
    readonly path: string; readonly type: 'tree' | 'blob' | 'commit'; readonly mode: string; readonly sha: string; readonly size?: number;
}
const modes: Readonly<Record<string, string>> = Object.freeze({ '040000': 'tree', '100644': 'blob', '100755': 'blob', '120000': 'blob', '160000': 'commit' });
const oid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const nameBytes = (entry: ImmutableProgressTreeEntry) => Buffer.from(entry.path + (entry.type === 'tree' ? '/' : ''), 'utf8');

/** Reconstruct the complete canonical Git tree object; a copied response SHA is not proof of completeness. */
export function verifyImmutableProgressDirectory(treeSha: string, value: unknown, paths: readonly string[]): readonly ImmutableProgressTreeEntry[] {
    const fail = () => progressInventoryError('inventory', paths.length, 0, paths);
    if (!oid(treeSha) || !Array.isArray(value)) throw fail();
    const names = new Set<string>();
    const entries = value.map((raw: unknown) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail();
        const entry = raw as Record<string, unknown>;
        if (!isProgressEvidencePath(entry.path) || entry.path.includes('/')
            || Buffer.from(entry.path).toString('utf8') !== entry.path || names.has(entry.path)
            || typeof entry.mode !== 'string' || !Object.prototype.hasOwnProperty.call(modes, entry.mode) || modes[entry.mode] !== entry.type || !oid(entry.sha)
            || (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || (entry.size as number) < 0))) throw fail();
        names.add(entry.path);
        return Object.freeze({ path: entry.path, type: entry.type as ImmutableProgressTreeEntry['type'], mode: entry.mode, sha: entry.sha,
            ...(entry.size !== undefined ? { size: entry.size as number } : {}) });
    }).sort((left, right) => Buffer.compare(nameBytes(left), nameBytes(right)));
    const records = entries.map(entry => Buffer.concat([Buffer.from(`${entry.mode.replace(/^0/u, '')} ${entry.path}\0`, 'utf8'), Buffer.from(entry.sha, 'hex')]));
    const bytes = Buffer.concat(records);
    if (createHash('sha1').update(`tree ${bytes.length}\0`).update(bytes).digest('hex') !== treeSha) throw fail();
    return Object.freeze(entries);
}
