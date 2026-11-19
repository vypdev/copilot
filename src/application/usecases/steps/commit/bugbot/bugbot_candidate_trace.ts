import type { BugbotFinding } from '../../../../../domain/bugbot/finding';

export type BugbotCandidateDisposition = 'invalid' | 'analysis-incomplete' | 'response-limit' | 'unsafe-path' | 'ignored'
    | 'confidence' | 'severity' | 'duplicate' | 'human-dismissed' | 'prepared';

interface CandidateOrigin {
    readonly origin: string;
    readonly partition: number | null;
    readonly position: number;
    disposition: BugbotCandidateDisposition;
    candidateId?: string;
    anchor?: { readonly path: string; readonly line: number; readonly end: number };
}

interface DetectionPartition {
    readonly partition: number | null;
    readonly partitionId?: string;
    readonly wallMs: number;
    readonly status: 'completed' | 'failed';
    readonly observed: number;
}

interface TraceEntry {
    readonly row: CandidateOrigin;
    retained?: BugbotFinding;
}

/** Review-local lineage. Neither the provider nor a candidate's supplied ID can choose an origin. */
export class BugbotCandidateTrace {
    private readonly origins = new Map<number, TraceEntry[]>();
    private readonly detection = new Map<number, DetectionPartition>();
    private readonly normalized = new WeakMap<BugbotFinding, TraceEntry>();
    private ordered: TraceEntry[] = [];

    recordResponse(response: unknown, partition: number | null, wallMs: number, partitionId?: string): void {
        const findings = response !== null && typeof response === 'object' && 'findings' in response
            && Array.isArray(response.findings) ? response.findings : undefined;
        this.detection.set(partition ?? 0, { partition, partitionId, wallMs,
            status: findings ? 'completed' : 'failed', observed: findings?.length ?? 0 });
        if (!findings) return;
        this.origins.set(partition ?? 0, Array.from(findings, (_finding, index) => ({
            row: { origin: `${partition ?? 'review'}:${index + 1}`, partition,
                position: index + 1, disposition: 'response-limit' },
        })));
    }

    private entries(): TraceEntry[] {
        return [...this.origins].sort(([left], [right]) => left - right).flatMap(([, entries]) => entries);
    }

    startPreparation(): void {
        this.ordered = this.entries();
    }

    normalize(index: number, finding?: BugbotFinding): void {
        const entry = this.ordered[index];
        if (!entry) return;
        entry.row.disposition = 'invalid';
        if (!finding) return;
        if (finding.file && finding.line) {
            entry.row.anchor = { path: finding.file, line: finding.line, end: finding.endLine ?? finding.line };
        }
        this.normalized.set(finding, entry);
    }

    classify(finding: BugbotFinding, disposition: BugbotCandidateDisposition, retained?: BugbotFinding): void {
        const entry = this.normalized.get(finding);
        if (!entry) return;
        entry.row.disposition = disposition;
        entry.retained = retained;
        if (disposition === 'prepared') entry.row.candidateId = (retained ?? finding).id;
    }

    detectionSnapshot(): readonly DetectionPartition[] {
        return [...this.detection.values()].sort((left, right) => (left.partition ?? 0) - (right.partition ?? 0));
    }

    snapshot() {
        if (!this.ordered.length) {
            return this.entries().map(({ row }) => ({ ...row, disposition: 'analysis-incomplete' as const }));
        }
        return this.ordered.map(({ row, retained }) => {
            const retainedId = retained && this.normalized.get(retained)?.row.candidateId;
            return { ...row, ...(retainedId ? { candidateId: retainedId } : {}) };
        });
    }
}
