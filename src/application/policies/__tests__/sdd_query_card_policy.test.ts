import { renderSddGateRecord, type SddGateRecord } from '../../../domain/pre_branch_sdd';
import { selectOwnedSddCard, type SddQueryComment } from '../sdd_query_card_policy';

const record: SddGateRecord = { version: 1, issueNumber: 42, phase: 'published', issueDigest: 'd'.repeat(64),
    baseSha: 'a'.repeat(40), round: 1, branchName: 'feature/42', commitSha: 'b'.repeat(40),
    plan: { action: 'update', path: 'specs/payments.md', capabilityId: 'payments',
        reason: 'This capability owns the payment workflow contract.', questions: [] } };
const body = renderSddGateRecord(record);
const card = (id: number, content = body, login = 'vypbot'): SddQueryComment => ({ id, body: content, user: { login } });
const select = (comments: readonly SddQueryComment[], bot = 'vypbot') => selectOwnedSddCard(comments, 42, bot);

describe('owned SDD card authority', () => {
    it('rejects retained answer IDs that cannot be compared safely with live comments', () => {
        const unsafe = renderSddGateRecord({ ...record, answers: [{ questionId: 'Q1', author: 'author', commentId: Number.MAX_SAFE_INTEGER + 1, text: 'Choice' }] });
        expect(select([card(7, unsafe)])).toEqual({ state: 'invalid' });
    });
    it('reports absence from an empty complete comment inventory', () => expect(select([])).toEqual({ state: 'absent' }));
    it('accepts only the exact configured login with GitHub case semantics', () => {
        expect(select([card(7, body, 'VypBot')])).toMatchObject({ state: 'valid', id: 7, record });
    });
    it.each(['human', 'foreign[bot]'])('ignores copied or malformed metadata by %s', login => {
        expect(select([card(7), card(8, '<!-- copilot:sdd-gate:v1\nbad\n-->', login)])).toMatchObject({ state: 'valid', id: 7 });
    });
    it('never falls back after the latest owned metadata becomes malformed', () => {
        expect(select([card(7), card(8, '<!-- copilot:sdd-gate:v1\nbad\n-->')])).toEqual({ state: 'invalid' });
    });
    it('never falls back after a newer owned record claims a different issue', () => {
        expect(select([card(7), card(8, renderSddGateRecord({ ...record, issueNumber: 43 }))])).toEqual({ state: 'invalid' });
    });
    it.each([body, renderSddGateRecord({ ...record, commitSha: 'c'.repeat(40) })])('rejects multiple markers within one owned card', duplicate => {
        expect(select([card(7, `${body}\n${duplicate}`)])).toEqual({ state: 'invalid' });
    });
    it('rejects contradictory representations of one latest comment ID', () => {
        expect(select([card(7), card(7, renderSddGateRecord({ ...record, commitSha: 'c'.repeat(40) }))])).toEqual({ state: 'invalid' });
    });
    it('collapses byte-identical repetitions of the same provider comment', () => {
        expect(select([card(7), card(7)])).toMatchObject({ state: 'valid', id: 7 });
    });
    it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])('cannot order an owned card with unsafe ID %s', id => {
        expect(select([card(7), card(id)])).toEqual({ state: 'invalid' });
    });
    it('does not infer bot authority from a bot suffix when configuration is absent', () => {
        expect(select([card(7, body, 'vypbot[bot]')], '')).toEqual({ state: 'unavailable' });
    });
    it('recognizes a latest localized owned card that lost its marker as invalid', () => {
        expect(select([card(7), card(8, '## Estado del SDD\n\nMetadata unavailable.')])).toEqual({ state: 'invalid' });
    });
});
