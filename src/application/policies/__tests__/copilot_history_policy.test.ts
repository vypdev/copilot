import { buildOperationEvidenceMarker } from '../../../domain/copilot_operation';
import { selectCopilotHistory, type HistoryComment } from '../copilot_history_policy';
import { buildPublicationReplyMarker } from '../publication_identity_policy';
const source: HistoryComment = { id: 10, body: '/copilot fix all', author: 'developer' };
const evidence = { target: 'pr:42', correlationId: 'comment:10', command: 'fix' as const, outcome: 'applied' as const };
function receipt(changes: Partial<HistoryComment> = {}, operation = buildOperationEvidenceMarker(evidence), key = 'fix-result'): HistoryComment {
    return { id: 11, author: 'vypbot', body: `${buildPublicationReplyMarker({ target: 'pr:42', correlationId: 'comment:10', messageKey: key, digest: 'a'.repeat(16) })}\n\nApplied\n\n${operation}`, ...changes };
}
const select = (comments: readonly HistoryComment[] = [source, receipt()], changes = {}) => selectCopilotHistory({ target: 'pr:42', queryId: 100, botLogin: 'vypbot', complete: true, comments, ...changes });
describe('exact-target operation history', () => {
    it('selects strict evidenced requests without echoing any argument', () => {
        const result = select(); expect(result.rows).toEqual([{ sourceId: 10, command: 'fix', outcome: 'applied', receiptId: 11 }]);
        expect(Object.isFrozen(result.rows[0])).toBe(true); expect(JSON.stringify(result)).not.toContain('all');
    });
    it('does not mistake success prose or a legacy receipt for an applied operation', () => expect(select([source, receipt({}, '')]).rows[0]).toEqual({ sourceId: 10, command: 'fix', outcome: 'unavailable', receiptId: 11 }));
    it.each([
        { author: 'human' }, { id: 9 }, { body: receipt().body!.replace('pr:42', 'issue:42') },
        { body: receipt().body!.replace('comment:10', 'comment:8') }, { body: 'prefix\n' + receipt().body },
        { body: receipt().body! + receipt().body }, { body: receipt().body!.replace('schema="1"', 'schema="2"') },
    ])('rejects a forged, malformed or incorrectly correlated receipt %#', changes => {
        const result = select([source, receipt(changes)]); expect(result.rows.at(0)?.outcome).toBe('unavailable');
        expect(result.rows.at(0)?.receiptId).toBeUndefined();
    });
    it.each(['plan', 'status', 'history', 'review', 'help'])('excludes query %s from the operation vocabulary', name => expect(select([{ ...source, body: `/copilot ${name}` }]).rows).toEqual([]));
    it('excludes natural mentions, invalid commands, bot sources and automated sources', () => {
        expect(select([{ ...source, body: '@vypbot fix all' }, { ...source, id: 12, body: '/copilot fix' },
            { ...source, id: 13, author: 'vypbot' }, { ...source, id: 14, automated: true }]).rows).toEqual([]);
    });
    it('excludes the current query and future requests', () => expect(select([{ ...source, id: 100 }, { ...source, id: 101 }]).rows).toEqual([]));
    it('orders by source identity and selects exactly ten', () => {
        const rows = select(Array.from({ length: 14 }, (_, i) => ({ ...source, id: i + 1 }))).rows;
        expect(rows).toHaveLength(10); expect(rows.map(row => row.sourceId)).toEqual([14,13,12,11,10,9,8,7,6,5]);
    });
    it('collapses identical receipts by a canonical identity', () => expect(select([source, receipt(), receipt({ id: 12 })]).rows[0].receiptId).toBe(11));
    it('keeps conflicting outcomes unavailable instead of selecting a newest receipt', () => {
        expect(select([source, receipt(), receipt({ id: 12 }, buildOperationEvidenceMarker({ ...evidence, outcome: 'failed' }), 'application-error')]).rows[0].outcome).toBe('unavailable');
    });
    it('keeps conflicting verified SHAs unavailable', () => {
        const a = buildOperationEvidenceMarker(evidence, { localSha: 'a'.repeat(40), remoteSha: 'a'.repeat(40) });
        const b = buildOperationEvidenceMarker(evidence, { localSha: 'b'.repeat(40), remoteSha: 'b'.repeat(40) });
        expect(select([source, receipt({}, a), receipt({ id: 12 }, b)]).rows[0].commitSha).toBeUndefined();
    });
    it('rejects an outcome incompatible with its producer key', () => expect(select([source, receipt({}, buildOperationEvidenceMarker(evidence), 'application-error')]).rows[0].outcome).toBe('unavailable'));
    it('requires marker identity and command agreement', () => expect(select([source, receipt({}, buildOperationEvidenceMarker({ ...evidence, command: 'remember' }))]).rows[0].outcome).toBe('unavailable'));
    it('preserves a verified commit without deriving it from adjacent prose', () => {
        expect(select([source, receipt({}, buildOperationEvidenceMarker(evidence, { localSha: 'a'.repeat(40), remoteSha: 'a'.repeat(40) }))]).rows[0].commitSha).toBe('a'.repeat(40));
    });
    it('keeps retained records visibly partial', () => expect(select([source], { complete: false }).state).toBe('partial'));
    it('distinguishes complete empty from incomplete empty', () => { expect(select([]).state).toBe('complete'); expect(select([], { complete: false }).state).toBe('unavailable'); });
    it.each([{ target: 'pr:0' }, { target: 'issue:9999999999999999999' }, { queryId: 0 }, { botLogin: '' }, { botLogin: '@unsafe' }])('rejects an unavailable bound identity %#', changes => expect(select([source], changes).state).toBe('unavailable'));
    it('rejects an invalid provider comment identity without claiming empty history', () => expect(select([source, receipt({ id: 0 })]).state).toBe('unavailable'));
    it('rejects duplicate provider identities and oversized collections', () => { expect(select([source, source]).state).toBe('unavailable'); expect(select(Array.from({ length: 1001 }, (_, i) => ({ ...source, id: i+1 }))).state).toBe('unavailable'); });
    it('rejects broken JSON and extra marker fields without rendering unsafe data', () => {
        expect(select([source, receipt({}, '<!-- copilot:operation:v1 {"prompt":"@evil SECRET"} -->')]).rows[0].outcome).toBe('unavailable');
    });
});
