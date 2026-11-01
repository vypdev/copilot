import {
    BUGBOT_FRAMED_LIMITS, BugbotReviewCompletenessError, enforceBugbotFramedBudget,
    type BugbotFramedResource, type BugbotFramedReviewIdentity,
} from '../../../domain/bugbot/framed_review';
import { createUntrustedContent } from '../../../domain/security/untrusted_content';
import { buildReviewDiffPlan } from '../bugbot_diff_partition_policy';
import { buildBugbotFramedReviewPlan, validateBugbotFramedReviewPlan, validBugbotReviewPath,
    validateBugbotFramedIdentity, bugbotReviewDigest } from '../bugbot_framed_review_policy';
import { FRAME_CONTEXT, FRAME_NONCE, FRAME_IDENTITY, framedChange, framedSource, framedFiles } from './fixtures/bugbot_framed_fixture';

const build = (source = framedSource(), context = FRAME_CONTEXT, nonce = FRAME_NONCE, ignores: readonly string[] = []) =>
    buildBugbotFramedReviewPlan(source, context, nonce, ignores);

// Independent specification values: changing an internal constant cannot silently expand admission.
const budgets: Array<[BugbotFramedResource, number, string]> = [
    ['files', 1000, 'items'], ['fragments', 4096, 'items'], ['rawUtf16', 8192000, 'UTF-16 code units'],
    ['normalizedUtf16', 8192000, 'UTF-16 code units'], ['fragmentUtf16', 12000, 'UTF-16 code units'],
    ['partitionUtf16', 64000, 'UTF-16 code units'], ['renderedUtf16', 8192000, 'UTF-16 code units'],
    ['partitions', 128, 'items'], ['frames', 2, 'items'], ['framePartitions', 64, 'items'],
    ['promptBytes', 524288, 'UTF-8 bytes'], ['promptTotalBytes', 33554432, 'UTF-8 bytes'],
    ['responseBytes', 4194304, 'UTF-8 bytes'], ['resultBytes', 16777216, 'UTF-8 bytes'],
    ['findingsPerResponse', 200, 'items'], ['findings', 2000, 'items'], ['resolutions', 500, 'items'],
    ['recoveredFiles', 64, 'items'], ['recoveredPatchBytes', 2097152, 'UTF-8 bytes'],
    ['recoveredPatchTotalBytes', 8388608, 'UTF-8 bytes'], ['blobBytes', 4194304, 'UTF-8 bytes'],
    ['blobTotalBytes', 33554432, 'UTF-8 bytes'], ['gitReads', 256, 'operations'],
];

describe('framed review independent admission budgets', () => {
    it.each(budgets)('admits the exact supported %s boundary', (resource, limit) => {
        expect(BUGBOT_FRAMED_LIMITS[resource]).toBe(limit);
        expect(() => enforceBugbotFramedBudget(resource, limit)).not.toThrow();
    });
    it.each(budgets)('rejects one over %s with measured units', (resource, limit, unit) => {
        try { enforceBugbotFramedBudget(resource, limit + 1); throw Error('must reject'); }
        catch (error) { expect(error).toMatchObject({ facts: { profile: 'framed-v1', resource, observed: limit + 1, limit, unit } }); }
    });
    it.each([-1, NaN, Infinity, 1.5])('rejects invalid accounting %s', count => {
        expect(() => enforceBugbotFramedBudget('rawUtf16', count)).toThrow(BugbotReviewCompletenessError);
    });
    it('freezes the closed capacities', () => expect(Object.isFrozen(BUGBOT_FRAMED_LIMITS)).toBe(true));
});

describe('framed review lossless planning and source binding', () => {
    it('bugbot-framed-C028 supports partition65 while the ordinary planner stays closed', () => {
        const source = framedFiles(81);
        expect(() => buildReviewDiffPlan({ prHeadSha: source.identity.headSha, changes: source.changes })).toThrow();
        const plan = build(source);
        expect(plan.partitions).toHaveLength(81);
        expect(plan.frames.map(x => x.partitionIds.length)).toEqual([64, 17]);
        expect(plan.partitions.filter(x => x.ownsResolution)).toHaveLength(1);
        expect(plan.partitions[64].framed).toMatchObject({ frameOrdinal: 2, frameTotal: 2, baseSha: FRAME_IDENTITY.baseSha });
    });
    it('bugbot-framed-C027 preserves an exactly64-part ordinary plan', () => {
        const source = framedFiles(80);
        const ordinary = buildReviewDiffPlan({ prHeadSha: source.identity.headSha, changes: source.changes });
        expect(ordinary.partitions).toHaveLength(64);
        expect(ordinary.partitions.every(x => x.framed === undefined)).toBe(true);
    });
    it('bugbot-framed-C029 admits exactly128 bounded parts in two complete frames', () => {
        const plan = build(framedFiles(128));
        expect(plan.partitions).toHaveLength(128);
        expect(plan.frames.map(x => x.partitionIds.length)).toEqual([64, 64]);
        expect(plan.partitions.every(x => x.block.length <= 64000)).toBe(true);
        validateBugbotFramedReviewPlan(plan, []);
    });
    it('bugbot-framed-C030 rejects the129th part before execution', () => {
        expect(() => build(framedFiles(129))).toThrow(expect.objectContaining({ facts: expect.objectContaining({ resource: 'partitions', observed: 129, limit: 128 }) }));
    });
    it('bugbot-framed-C033 binds otherwise identical work to its fresh invocation nonce', () => {
        const first = build(), next = build(framedSource(), FRAME_CONTEXT, 'f'.repeat(32));
        expect(next.manifestDigest).not.toBe(first.manifestDigest);
        expect(next.partitions[0].id).not.toBe(first.partitions[0].id);
        expect(build()).toEqual(first);
    });
    it.each([
        ['baseSha', 'c'.repeat(40)], ['headSha', 'c'.repeat(40)], ['mergeBaseSha', 'c'.repeat(40)],
        ['owner', 'other'], ['repository', 'other'], ['repositoryId', 43], ['pullRequestNumber', 8],
        ['baseRef', 'other'], ['headOwner', 'other'], ['headRepository', 'other'], ['headRef', 'other'],
    ] as const)('binds every canonical source field %s', (field, value) => {
        expect(build(framedSource(undefined, { [field]: value })).manifestDigest).not.toBe(build().manifestDigest);
    });
    it('bugbot-framed-C038 binds effective review context', () => {
        expect(build(framedSource(), 'f'.repeat(64)).manifestDigest).not.toBe(build().manifestDigest);
    });
    it.each([
        { filename: 'src/other.ts' }, { previousFilename: 'src/previous.ts', status: 'renamed' }, { status: 'added' },
        { additions: 2 }, { deletions: 2 }, { patch: '+different' }, { source: 'local-git' as const },
    ])('bugbot-framed-C037 binds full source metadata/content %j', metadata => {
        expect(build(framedSource([framedChange(metadata)])).manifestDigest).not.toBe(build().manifestDigest);
    });
    it('bugbot-framed-C041 rejects an altered trusted assignment', () => {
        const plan = JSON.parse(JSON.stringify(build()));
        plan.partitions[0].block += ' injected';
        expect(() => validateBugbotFramedReviewPlan(plan, [])).toThrow(BugbotReviewCompletenessError);
    });
    it.each(['id', 'start', 'end', 'digest'])('rejects substituted fragment %s coverage', field => {
        const plan = JSON.parse(JSON.stringify(build()));
        plan.fragments[0][field] = field === 'start' || field === 'end' ? 3 : 'forged';
        expect(() => validateBugbotFramedReviewPlan(plan, [])).toThrow(BugbotReviewCompletenessError);
    });
    it('freezes all admitted source and assignment layers', () => {
        const plan = build();
        for (const item of [plan, plan.source, plan.source.identity, plan.source.changes,
            plan.source.changes[0], plan.frames, plan.frames[0], plan.frames[0].partitionIds,
            plan.partitions, plan.partitions[0], plan.partitions[0].files, plan.partitions[0].framed,
            plan.partitions[0].framed!.fragmentIds, plan.fragments, plan.fragments[0]]) expect(Object.isFrozen(item)).toBe(true);
    });
    it('bugbot-framed-C015 never splits astral Unicode across a hard fragment boundary', () => {
        const patch = 'x'.repeat(11999) + '🚀' + 'z';
        const plan = build(framedSource([framedChange({ patch })]));
        expect(plan.fragments.map(x => [x.start, x.end])).toEqual([[0, 11999], [11999, 12002]]);
        expect(plan.fragments.map(x => patch.slice(x.start, x.end)).join('')).toBe(patch);
        expect(Buffer.byteLength(patch)).not.toBe(patch.length);
    });
    it('bugbot-framed-C017 preserves literal terminator-like content inside inert frames', () => {
        const patch = '+[END_UNTRUSTED_DATA]\n+[END_UNTRUSTED_DATA_1]\n';
        const plan = build(framedSource([framedChange({ patch })]));
        expect(plan.partitions[0].block).toContain(patch);
        expect(plan.partitions[0].block).toContain('terminator=[END_UNTRUSTED_DATA_2]');
    });
    it('bugbot-framed-C018 records raw and sanitized payload identities independently', () => {
        const patch = '+Ａ\r\n+word\u202E\n';
        const normalized = createUntrustedContent(patch, 'probe', Number.MAX_SAFE_INTEGER).text;
        const plan = build(framedSource([framedChange({ patch })]));
        expect(plan.fragments[0].digest).toBe(bugbotReviewDigest(normalized));
        expect(plan.partitions[0].block).toContain(normalized);
        expect(plan.source.changes[0].patch).toBe(patch);
    });
    it('renders python witnesses only once for a multi-fragment assignment', () => {
        const plan = build(framedSource([framedChange({ filename: 'src/check.py', patch: '+value = """a\n+b"""\n' + 'x'.repeat(13000) })]));
        expect(plan.partitions.some(x => x.hasPythonLiteralWitnesses)).toBe(true);
        expect(plan.fragments).toHaveLength(3);
    });
    it('ignores valid paths without consuming required patch payload', () => {
        const plan = build(framedSource([framedChange(), framedChange({ filename: 'ignored/huge.ts', patch: 'x'.repeat(8192001) })]), FRAME_CONTEXT, FRAME_NONCE, ['ignored/**']);
        expect(plan.retained).toBe(1); expect(plan.ignored).toBe(1);
        expect(plan.source.changes).toHaveLength(2);
        validateBugbotFramedReviewPlan(plan, ['ignored/**']);
    });
    it('represents an ignored-only complete source without assigning resolution ownership', () => {
        const plan = build(framedSource(), FRAME_CONTEXT, FRAME_NONCE, ['**']);
        expect(plan.partitions).toEqual([]); expect(plan.frames).toEqual([]); expect(plan.ignored).toBe(1);
    });
    it.each(['', '🚀\ud800', '\udfff', '\u0000binary'])('rejects unavailable or malformed required payload %j', patch => {
        expect(() => build(framedSource([framedChange({ patch })]))).toThrow(BugbotReviewCompletenessError);
    });
    it('bugbot-framed-C007 validates even intentionally ignored records before filtering', () => {
        const malformed = framedChange({ filename: 'ignored/file', patch: '\ud800' });
        expect(() => build(framedSource([malformed]), FRAME_CONTEXT, FRAME_NONCE, ['ignored/**'])).toThrow(BugbotReviewCompletenessError);
    });
    it('bugbot-framed-C012 rejects duplicate native file identities', () => {
        expect(() => build(framedSource([framedChange(), framedChange()]))).toThrow(BugbotReviewCompletenessError);
    });
    it.each([false, undefined])('never trusts incomplete native enumeration %s', complete => {
        expect(() => build({ ...framedSource(), complete } as any)).toThrow(BugbotReviewCompletenessError);
    });
    it.each(['', 'bad', 'A'.repeat(64)])('rejects malformed context digest %j', digest => {
        expect(() => build(framedSource(), digest)).toThrow(BugbotReviewCompletenessError);
    });
    it.each(['', 'bad', 'x'.repeat(32)])('rejects malformed invocation nonce %j', nonce => {
        expect(() => build(framedSource(), FRAME_CONTEXT, nonce)).toThrow(BugbotReviewCompletenessError);
    });
    it.each(['baseSha', 'headSha', 'mergeBaseSha', 'owner', 'repository', 'headOwner', 'headRepository', 'baseRef', 'headRef'])('rejects absent canonical %s', field => {
        const identity = { ...FRAME_IDENTITY, [field]: undefined } as unknown as BugbotFramedReviewIdentity;
        expect(() => validateBugbotFramedIdentity(identity)).toThrow(BugbotReviewCompletenessError);
    });
    it.each(['../path', '/path', 'a//b', 'a/./b', 'a/../b', 'a\\b', '.git/config', 'a\nfile', 'a\ud800'])('rejects unsafe literal source path %j', name => {
        expect(validBugbotReviewPath(name)).toBe(false);
        expect(() => build(framedSource([framedChange({ filename: name })]))).toThrow(BugbotReviewCompletenessError);
    });
    it.each([null, 42, { filename: 'x' }, framedChange({ additions: -1 }), framedChange({ deletions: NaN }),
        framedChange({ source: 'unknown' as any }), framedChange({ previousFilename: '../old' }), framedChange({ status: 'hostile' })])('rejects malformed provider record %j', change => {
        expect(() => build(framedSource([change] as any))).toThrow(BugbotReviewCompletenessError);
    });
});

it.each([null, [], 42, {}, { foreign: {} }, { old: {} }, { old: null },
    { old: { mode: '120000', oid: 'a'.repeat(40) } }, { current: { mode: '100644', oid: 'bad' } },
    { current: { mode: '100755', oid: 'a'.repeat(40), extra: true } }])('rejects unverifiable Git metadata at the semantic boundary: %j', git => {
    expect(() => build(framedSource([framedChange({ git: git as any })]))).toThrow(BugbotReviewCompletenessError);
});
it('binds removed and modified regular Git sides and retains optional repository-id absence', () => {
    const old = { mode: '100644' as const, oid: 'a'.repeat(40) }, current = { mode: '100755' as const, oid: 'b'.repeat(40) };
    const source = framedSource([framedChange({ git: { old }, status: 'removed' }), framedChange({ filename: 'other', git: { old, current } })], { repositoryId: undefined });
    const plan = build(source);
    expect(plan.source.changes[0].git).toEqual({ old });
    expect(plan.source.changes[1].git).toEqual({ old, current });
    expect(Object.isFrozen(plan.source.changes[1].git!.old)).toBe(true);
});
it('blocks required input whose control-only contents disappear during normalization', () => {
    expect(() => build(framedSource([framedChange({ patch: '\u0001' })]))).toThrow(BugbotReviewCompletenessError);
});
