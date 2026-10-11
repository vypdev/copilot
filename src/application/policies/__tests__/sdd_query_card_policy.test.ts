import { renderSddGateRecord, type SddGateRecord } from '../../../domain/pre_branch_sdd';
import { buildPublicationMarker, buildPublicationReplyMarker, buildPublicationTransitionMarker } from '../publication_identity_policy';
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

const otherPublication = (kind: 'status' | 'reply' | 'transition', issueNumber = 42) => {
    const identity = { topic: 'branch-sync' as const, target: { kind: 'issue' as const, number: issueNumber }, key: 'dependency:abc' };
    if (kind === 'status') return buildPublicationMarker({ identity, sourceVersion: 'comparison:abc', digest: '12345678' });
    if (kind === 'transition') return buildPublicationTransitionMarker({ identity, fingerprint: '12345678', messageKey: 'branchSync.transition.required' });
    return buildPublicationReplyMarker({ target: `issue:${issueNumber}`, correlationId: 'comment:9', messageKey: 'status-command', digest: '12345678' });
};

describe('native identity survives complete SDD-card body loss', () => {
    it.each([null, '', 'Both the metadata and the heading have been removed.'])('never revives an older publication behind a newer unidentified owned body: %s', content => {
        expect(select([card(7), { ...card(8), body: content }])).toEqual({ state: 'invalid' });
    });
    it.each(['status', 'reply', 'transition'] as const)('preserves readiness after a canonical exact-issue %s publication', kind => {
        expect(select([card(7), card(8, `${otherPublication(kind)}\n\nAnother product surface.`)])).toMatchObject({ state: 'valid', id: 7 });
    });
    it.each(['foreign issue', 'foreign PR', 'quoted header'])('does not use a %s marker to exclude unknown newer ownership', scenario => {
        let newer = otherPublication('reply', scenario === 'foreign issue' ? 43 : 42);
        if (scenario === 'foreign PR') newer = newer.replace('target="issue:42"', 'target="pr:42"');
        if (scenario === 'quoted header') newer = `Quoted content:\n${newer}`;
        expect(select([card(7), card(8, newer)])).toEqual({ state: 'invalid' });
    });
    it('rejects contradictory native IDs before excluding a canonical other surface', () => {
        expect(select([card(7), card(8, 'Damaged card'), card(8, otherPublication('reply'))])).toEqual({ state: 'invalid' });
    });
    it('never masks SDD metadata behind a canonical other publication header', () => {
        expect(select([card(7), card(8, `${otherPublication('reply')}\n<!-- copilot:sdd-gate:v1\nbad\n-->`)])).toEqual({ state: 'invalid' });
    });
    it('allows a newer identified SDD card to supersede an older unknown owned comment', () => {
        expect(select([card(6, 'Older damaged card'), card(7)])).toMatchObject({ state: 'valid', id: 7 });
    });
});
