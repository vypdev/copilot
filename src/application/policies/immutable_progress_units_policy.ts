import { createHash } from 'node:crypto';
import type { ProgressDiffChange, ProgressEvidenceProtocol } from '../ports/progress_diff_query_ports';
import { MAX_FRAMED_PROGRESS_FILE_BYTES } from './progress_recovery_capacity_policy';
import { isProgressGeneratedArtifact } from './progress_generated_artifact_policy';

type RecordValue = Readonly<Record<string, unknown>>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: RecordValue, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const oid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const snapshot = (value: unknown, path: string): value is RecordValue => record(value) && exact(value, ['path', 'sha', 'mode', 'bytes'])
    && value.path === path && oid(value.sha) && ['100644', '100755'].includes(value.mode as string)
    && Number.isSafeInteger(value.bytes) && (value.bytes as number) >= 0 && (value.bytes as number) <= MAX_FRAMED_PROGRESS_FILE_BYTES;

/** Recheck complete side coverage and blob identities independently of host packing and compact indexes. */
export function validImmutableProgressUnits(changes: readonly ProgressDiffChange[], protocol: ProgressEvidenceProtocol): boolean {
    const groups = new Map<string, ProgressDiffChange[]>();
    for (const change of changes) groups.set(change.path, [...(groups.get(change.path) ?? []), change]);
    let representedBytes = 0;
    for (const [path, units] of groups) {
        if (units.some(unit => unit.statistics !== 'immutable-content-only' || !unit.unitId || !['added', 'removed', 'modified'].includes(unit.status))) return false;
        if (isProgressGeneratedArtifact(path)) {
            if (units.length !== 1 || units[0].evidence !== 'generated-metadata-only'
                || !exact(units[0] as unknown as RecordValue, ['path', 'status', 'statistics', 'unitId', 'evidence'])) return false;
            continue;
        }
        const first = units[0].recoveredContent;
        if (!record(first) || first.comparisonBaseSha !== protocol.preimageSha
            || !(first.base === null || snapshot(first.base, path)) || !(first.head === null || snapshot(first.head, path))
            || first.base === null && first.head === null) return false;
        const before = first.base as RecordValue | null, after = first.head as RecordValue | null;
        const status = before === null ? 'added' : after === null ? 'removed' : 'modified';
        const identical = before && after && before.sha === after.sha;
        if (identical && before!.bytes !== after!.bytes) return false;
        const sides = identical ? ['both'] : [...(before ? ['base'] : []), ...(after ? ['head'] : [])];
        const identity = JSON.stringify({ base: before, head: after });
        if (units.some(unit => {
            const content = unit.recoveredContent;
            return !exact(unit as unknown as RecordValue, ['path', 'status', 'statistics', 'unitId', 'recoveredContent'])
                || unit.status !== status || !record(content)
                || !exact(content, ['comparisonBaseSha', 'base', 'head', 'side', 'byteOffset', 'byteLength', 'text'])
                || content.comparisonBaseSha !== protocol.preimageSha || JSON.stringify({ base: content.base, head: content.head }) !== identity
                || !sides.includes(content.side as string);
        })) return false;
        for (const side of sides) {
            const expected = side === 'base' ? before! : after!;
            const chunks = units.filter(unit => unit.recoveredContent!.side === side);
            if (chunks.length === 0) return false;
            let offset = 0;
            const bytes: Buffer[] = [];
            for (const unit of chunks) {
                const content = unit.recoveredContent!;
                if (typeof content.text !== 'string' || Buffer.byteLength(JSON.stringify(content.text), 'utf8') > 120_000 || content.byteOffset !== offset) return false;
                const chunk = Buffer.from(content.text, 'utf8');
                if (chunk.includes(0) || chunk.toString('utf8') !== content.text || content.byteLength !== chunk.length
                    || chunk.length === 0 && (chunks.length !== 1 || expected.bytes !== 0)) return false;
                bytes.push(chunk); offset += chunk.length;
            }
            if (offset !== expected.bytes || createHash('sha1').update(`blob ${offset}\0`).update(Buffer.concat(bytes)).digest('hex') !== expected.sha) return false;
        }
        representedBytes += (before?.bytes as number ?? 0) + (after?.bytes as number ?? 0);
    }
    return protocol.recovery?.total.files === groups.size && protocol.recovery.total.bytes === representedBytes;
}
