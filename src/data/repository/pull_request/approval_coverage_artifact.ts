import { readSingleJsonArtifact } from '../github/read_single_json_artifact';

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
    const parsed = readSingleJsonArtifact(value, 'copilot-diff-coverage.json');
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
