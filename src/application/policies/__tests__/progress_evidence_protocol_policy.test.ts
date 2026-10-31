import { frameProgressEvidence, bindProgressEvidence, validateFramedProgressEvidence } from '../progress_evidence_protocol_policy';
import { initialProgressRecoveryUsage } from '../progress_recovery_capacity_policy';
import { MAX_PROGRESS_EVIDENCE_BYTES } from '../progress_diff_partition_policy';
import { ATTEMPT, PREIMAGE, changes, plan, framed, bound, clone, type Multipart } from './fixtures/framed_progress_fixture';

const validate = (value: unknown, isBound = false) => validateFramedProgressEvidence(value as Multipart, isBound);
const rejects = (value: unknown, reason: string, isBound = false) => expect(() => validate(value, isBound)).toThrow(`(${reason})`);
type Mutable = { protocol: Record<string, unknown>; partitions: Record<string, unknown>[]; baseSha: string; headSha: string; evidence: string };
const mutable = (): Mutable => clone(framed()) as unknown as Mutable;

it('pins every source, complete inventory, preimage and frozen attempt manifest', () => {
    const source = framed(); validate(source);
    expect(source.protocol).toMatchObject({ version: 'framed-v1', attemptId: ATTEMPT, preimageSha: PREIMAGE, unitCount: 2 });
    expect(source.partitions.map(part => part.sourceIdentity!.ordinal)).toEqual([1, 2]);
    expect([source, source.protocol, source.partitions, ...source.partitions].every(Object.isFrozen)).toBe(true);
});
it.each([
    ['version', 'other'], ['attemptId', 'not-a-host-uuid'], ['preimageSha', 'moving-branch'], ['sourcesDigest', 'x'],
    ['manifestDigest', 'x'], ['requiredPaths', []], ['requiredPaths', ['../outside']], ['requiredPaths', ['a', 'a']],
    ['requiredPaths', Array.from({ length: 300 }, (_, i) => `${i}.md`)], ['unitCount', 0], ['unitCount', 513], ['unitCount', 1.5],
    ['recovery', {}], ['recovery', { frames: 0 }], ['recovery', { frames: 5, current: {}, total: {} }],
    ['assessmentContextDigest', 'unexpected-before-binding'], ['extra', 'unknown'],
])('rejects corrupt manifest field %s %#', (key, value) => {
    const diff = mutable(); diff.protocol[key] = value; rejects(diff, 'source-manifest-identity');
});
it.each(['baseSha', 'headSha'])('rejects mutable or malformed comparison %s', key => {
    const diff = mutable(); diff[key as 'baseSha' | 'headSha'] = 'branch-name'; rejects(diff, 'source-manifest-identity');
});
it.each([undefined, null, 'protocol'])('rejects a missing or nonobject manifest %#', protocol => {
    rejects({ ...framed(), protocol }, 'source-manifest-identity');
});
it.each([[], undefined, Array(65).fill(null)])('rejects an absent or over-capacity part inventory %#', partitions => {
    rejects({ ...framed(), partitions }, 'source-part-count');
});
it.each([null, 'source', { evidence: 12 }])('rejects malformed source parts %#', part => {
    rejects({ ...framed(), partitions: [part] }, 'source-part-shape');
});
it.each(['files', 'bytes', 'requests', 'treeEntries'])('validates both epoch and total %s counters independently', key => {
    for (const [section, amount] of [['current', -1], ['current', 1.5], ['current', 999_999_999], ['total', -1], ['total', 999_999_999]] as const) {
        const diff = mutable(); (diff.protocol.recovery as Record<string, Record<string, number>>)[section][key] = amount;
        rejects(diff, 'source-manifest-identity');
    }
    const diff = mutable(); (diff.protocol.recovery as Record<string, Record<string, number>>).current[key] = 1;
    rejects(diff, 'source-manifest-identity');
});
it('rejects impossible totals for the declared frame count', () => {
    const diff = mutable(); (diff.protocol.recovery as Record<string, Record<string, number>>).total.files = 65;
    rejects(diff, 'source-manifest-identity');
});
it('rejects unknown counter keys and noninteger frame counts', () => {
    const diff = mutable(); (diff.protocol.recovery as Record<string, Record<string, number>>).total.extra = 1;
    rejects(diff, 'source-manifest-identity');
    const other = mutable(); (other.protocol.recovery as Record<string, unknown>).frames = 1.5;
    rejects(other, 'source-manifest-identity');
});
it('supports complete API patches without claiming recovery usage', () => {
    const result = frameProgressEvidence(plan(), PREIMAGE, changes, changes.map(c => c.path), undefined, ATTEMPT);
    expect(result.protocol!.recovery).toBeNull(); validate(result);
});
it.each(['id', 'digest', 'ordinal', 'total', 'extra'])('rejects missing, replayed or corrupt source identity %s', key => {
    const diff = mutable(); (diff.partitions[0].sourceIdentity as Record<string, unknown>)[key] = 'corrupt';
    rejects(diff, 'source-part-digest');
});
it('rejects missing source identity and substituted request ID', () => {
    const diff = mutable(); delete diff.partitions[0].sourceIdentity; rejects(diff, 'source-part-digest');
    const other = mutable(); other.partitions[0].id = 'replayed'; rejects(other, 'source-part-digest');
});
it('rejects reordered or omitted source assignments', () => {
    const diff = mutable(); diff.partitions.reverse(); rejects(diff, 'source-part-digest');
    const missing = mutable(); missing.partitions.pop(); rejects(missing, 'source-part-digest');
});
it('rejects oversized source parts before parsing them', () => {
    const diff = mutable(); diff.partitions[0].evidence = 'x'.repeat(MAX_PROGRESS_EVIDENCE_BYTES + 1);
    expect(() => validate(diff)).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
});
function reframe(edit: (part: Record<string, unknown>) => void) {
    const input = clone(plan()) as unknown as Mutable; edit(input.partitions[0]);
    return () => frameProgressEvidence(input as unknown as Multipart, PREIMAGE, changes, changes.map(c => c.path), undefined, ATTEMPT);
}
it('rejects invalid JSON even when the source digest was consistently computed', () => {
    expect(reframe(part => { part.evidence = '{'; })).toThrow('(source-part-json)');
});
it.each([null, [], {}, { kind: 'other' }, { kind: 'pinned-branch-comparison', baseSha: 'a', headSha: 'b', changes: [] }])('rejects invalid parsed source identity %#', value => {
    expect(reframe(part => { part.evidence = JSON.stringify(value); })).toThrow('(source-part-identity)');
});
it.each([null, { path: '../unsafe' }, { path: 'safe', unitId: 1 }, { path: 'safe', unitId: '' }, { path: 'safe', unitId: 'x'.repeat(101) }])('rejects malformed source changes %#', change => {
    expect(reframe(part => { const value = JSON.parse(part.evidence as string); value.changes = [change]; part.evidence = JSON.stringify(value); })).toThrow('(source-part-identity)');
});
it('rejects disagreement between independent paths and source payload', () => {
    expect(reframe(part => { part.paths = ['other.md']; })).toThrow('(source-part-paths)');
});
it('rejects omitted or inconsistent unit metadata', () => {
    expect(reframe(part => { delete part.units; })).toThrow('(source-part-units)');
    expect(reframe(part => { part.units = [{ id: 'other', path: 'specs/a.md' }]; })).toThrow('(source-part-units)');
});
it('rejects a consistently hashed plan that lost a complete original source', () => {
    const input = plan(); const partial = { ...input, partitions: input.partitions.slice(0, 1) };
    expect(() => frameProgressEvidence(partial, PREIMAGE, changes, changes.map(c => c.path), undefined, ATTEMPT)).toThrow('(source-coverage)');
});
it('rejects duplicate units and missing required paths even with recomputed digests', () => {
    expect(() => frameProgressEvidence(plan(), PREIMAGE, changes, ['specs/a.md'], undefined, ATTEMPT)).toThrow('(source-coverage)');
    const original = plan(); const input = { ...original, partitions: [original.partitions[0], original.partitions[0]] };
    expect(() => frameProgressEvidence(input, PREIMAGE, [changes[0], changes[0]], ['specs/a.md'], undefined, ATTEMPT)).toThrow('(source-coverage)');
});
it('requires canonical manifest serialization and independently verified digest', () => {
    const diff = mutable(); diff.evidence += ' '; rejects(diff, 'source-manifest-digest');
    const other = mutable(); other.protocol.manifestDigest = 'd'.repeat(64); rejects(other, 'source-manifest-digest');
});
it('rejects a complete canonical manifest that exceeds its unchanged per-request budget', () => {
    const paths = Array.from({ length: 180 }, (_, index) => `${index}-${'x'.repeat(850)}.md`);
    const complete = paths.map(path => ({ path, status: 'added', additions: 1, deletions: 0, patch: '# source' }));
    // Group into at most 64 individually bounded parts, retaining every original path.
    const groups = Array.from({ length: 60 }, (_, index) => complete.slice(index * 3, index * 3 + 3));
    const input = { ...plan(), partitions: groups.map((items, index) => ({ id: `source-${index}`, paths: items.map(change => change.path),
        evidence: JSON.stringify({ kind: 'pinned-branch-comparison', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), changes: items }) })) };
    expect(() => frameProgressEvidence(input, PREIMAGE, complete, paths, undefined, ATTEMPT)).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
});
it('binds fixed-size request IDs to the complete current assessment context', () => {
    const diff = framed(); const first = bindProgressEvidence(diff, 'issue', 'scope', 'en-US') as Multipart;
    validate(first, true); expect(first.partitions[0].id).toMatch(/^progress-request-[a-f0-9]{64}$/);
    for (const [issue, scope, locale] of [['new issue', 'scope', 'en-US'], ['issue', 'new scope', 'en-US'], ['issue', 'scope', 'es-ES']]) {
        expect((bindProgressEvidence(diff, issue, scope, locale) as Multipart).partitions[0].id).not.toBe(first.partitions[0].id);
    }
    expect(diff.protocol!.assessmentContextDigest).toBeUndefined();
});
it('rejects unbound source IDs and a corrupt context at the assessment boundary', () => {
    rejects(framed(), 'source-manifest-identity', true);
    const diff = clone(bound()); (diff.protocol as unknown as Record<string, unknown>).assessmentContextDigest = 'd'.repeat(64);
    rejects(diff, 'source-part-digest', true);
});
it('gives the same complete sources fresh replay-resistant request IDs on a new invocation', () => {
    const other = frameProgressEvidence(plan(), PREIMAGE, changes, changes.map(c => c.path), initialProgressRecoveryUsage(), '22222222-2222-4222-8222-222222222222');
    expect((bindProgressEvidence(other, 'Complete both specifications.', '{"requirements":["R1"]}', 'en-US') as Multipart).partitions[0].id).not.toBe(bound().partitions[0].id);
});
it('preserves legacy single and partitioned adapters without inventing protocol metadata', () => {
    const single = { kind: 'single' as const, baseSha: 'a', headSha: 'b', evidence: 'legacy' };
    expect(bindProgressEvidence(single, '', '', '')).toBe(single); const legacy = plan();
    expect(bindProgressEvidence(legacy, '', '', '')).toBe(legacy);
});
