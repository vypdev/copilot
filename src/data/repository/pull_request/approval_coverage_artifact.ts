import { inflateRawSync } from 'node:zlib';

export interface ApprovalCoverageAttestation {
    readonly version: 1;
    readonly repositoryId: number;
    readonly pullNumber: number;
    readonly headSha: string;
    readonly baseSha: string;
    readonly workflowRunId: number;
    readonly workflowRunAttempt: number;
    readonly coveredChangedLines: number;
    readonly totalChangedLines: number;
}

/** Parse one bounded GitHub artifact as data; never extract paths or execute content. */
export function parseApprovalCoverageZip(value: Uint8Array): ApprovalCoverageAttestation | undefined {
    const zip = Buffer.from(value);
    if (zip.length > 64 * 1024 || zip.length < 30) return undefined;
    let eocd = -1;
    for (let index = zip.length - 22; index >= Math.max(0, zip.length - 65_557); index--) {
        if (zip.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
    }
    if (eocd < 0 || zip.readUInt16LE(eocd + 10) !== 1) return undefined;
    const central = zip.readUInt32LE(eocd + 16);
    if (central + 46 > zip.length || zip.readUInt32LE(central) !== 0x02014b50) return undefined;
    const method = zip.readUInt16LE(central + 10);
    const compressedSize = zip.readUInt32LE(central + 20);
    const plainSize = zip.readUInt32LE(central + 24);
    const nameLength = zip.readUInt16LE(central + 28);
    const name = zip.subarray(central + 46, central + 46 + nameLength).toString('utf8');
    const local = zip.readUInt32LE(central + 42);
    if (name !== 'copilot-diff-coverage.json' || plainSize > 16_384 || compressedSize > 64 * 1024
        || ![0, 8].includes(method) || local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) return undefined;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    if (start + compressedSize > zip.length) return undefined;
    let raw: Buffer;
    try {
        const contents = zip.subarray(start, start + compressedSize);
        raw = method === 0 ? contents : inflateRawSync(contents, { maxOutputLength: 16_384 });
    } catch { return undefined; }
    if (raw.length !== plainSize) return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString('utf8')); } catch { return undefined; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const item = parsed as Record<string, unknown>;
    const keys = [
        'version', 'repositoryId', 'pullNumber', 'headSha', 'baseSha', 'workflowRunId',
        'workflowRunAttempt', 'coveredChangedLines', 'totalChangedLines',
    ];
    if (Object.keys(item).sort().join(',') !== keys.sort().join(',') || item.version !== 1
        || ![item.repositoryId, item.pullNumber, item.workflowRunId, item.workflowRunAttempt,
            item.coveredChangedLines, item.totalChangedLines].every(Number.isSafeInteger)
        || !/^[a-f0-9]{40}$/iu.test(String(item.headSha)) || !/^[a-f0-9]{40}$/iu.test(String(item.baseSha))
        || Number(item.repositoryId) <= 0 || Number(item.pullNumber) <= 0 || Number(item.workflowRunId) <= 0
        || Number(item.workflowRunAttempt) <= 0 || Number(item.totalChangedLines) < 0
        || Number(item.coveredChangedLines) < 0 || Number(item.coveredChangedLines) > Number(item.totalChangedLines)) return undefined;
    return item as unknown as ApprovalCoverageAttestation;
}
