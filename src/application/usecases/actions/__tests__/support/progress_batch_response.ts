import { partitionProgressDiff } from '../../../../policies/progress_diff_partition_policy';

/** Upgrade existing deterministic assessment fakes to the current native receipt schema. */
export function withProgressEvidence(response: unknown, schema: any): any {
    if (!schema?.properties?.manifestDigest && !schema?.properties?.snapshotDigest) return response;
    let payload: any = response;
    if (typeof response === 'string') {
        try { payload = JSON.parse(response); } catch { return response; }
    }
    if (!payload) return response;
    const properties = schema.properties;
    if (properties.snapshotDigest && Array.isArray(payload.lines)) {
        const value = { ...payload, snapshotDigest: payload.snapshotDigest ?? properties.snapshotDigest.enum[0],
            assignmentId: payload.assignmentId ?? properties.assignmentId.enum[0], headSha: payload.headSha ?? properties.headSha.enum[0] };
        return typeof response === 'string' ? JSON.stringify(value) : value;
    }
    if (!Array.isArray(payload.requirements)) return response;
    const assigned = properties.requirements.items.properties;
    const value = { ...payload, manifestDigest: payload.manifestDigest ?? properties.manifestDigest.enum[0],
        batchId: payload.batchId ?? properties.batchId.enum[0], headSha: payload.headSha ?? properties.headSha.enum[0],
        requirements: payload.requirements.map((fact: any) => ({ ...fact,
            id: typeof fact.id === 'string' && /^R[1-9]\d*$/u.test(fact.id) && !assigned.id.enum.includes(fact.id) && Number(fact.id.slice(1)) <= assigned.id.enum.length
                ? assigned.id.enum[Number(fact.id.slice(1)) - 1] : fact.id,
            citations: fact.citations ?? [assigned.citations.items.enum[0]] })) };
    return typeof response === 'string' ? JSON.stringify(value) : value;
}

export function progressComparisonFixture(baseSha: string, headSha: string, patch: string) {
    return partitionProgressDiff(baseSha, headSha, [{ path: "src/fixture.ts", status: "modified", additions: 1, deletions: 0, patch }]);
}
