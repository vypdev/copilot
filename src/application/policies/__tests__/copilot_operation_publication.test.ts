import { Result } from '../../../data/model/result';
import { selectSemanticReplyIntents, renderSemanticReply } from '../semantic_result_publication_policy';
import { readOperationEvidence } from '../../../domain/copilot_operation';
const context = { target: { kind: 'pull-request' as const, number: 42 }, correlationId: 'comment:10', locale: 'en-US' };
const select = (id: string, payload: unknown) => selectSemanticReplyIntents({ ...context, results: [new Result({ id, payload, success: true, executed: true })] });
describe('trusted finalized producer operation evidence', () => {
    it.each([
        ['already-aligned','already-current'], ['dry-run-clean','not-applied'], ['dry-run-conflicted','not-applied'],
        ['merged-cleanly','applied'], ['merged-with-agent','applied'],
    ])('maps typed sync %s without treating a local SHA as remote proof', (outcome, expected) => {
        const intents = select('SyncBranchUseCase', { outcome, parentBranch: 'develop', workingBranch: 'feature/42', commitSha: 'a'.repeat(40), verificationCount: 1 });
        const evidence = readOperationEvidence(renderSemanticReply(intents[0])); expect(evidence?.outcome).toBe(expected); expect(evidence?.command).toBe('sync-branch'); expect(evidence?.commitSha).toBeUndefined();
    });
    it.each([['remember','saved', 'applied'],['remember','already-exists','already-current'],['remember','not-applied','not-applied'],
        ['dismiss','completed','applied'],['dismiss','not-applied','not-applied']])('maps typed %s/%s', (command, outcome, expected) => {
        const evidence = readOperationEvidence(renderSemanticReply(select('CommentAutomation.StateCommandReply', { publication: { kind: 'state-command-result', command, outcome, branch: 'feature/42', count: 2 } })[0])); expect(evidence?.outcome).toBe(expected); expect(evidence?.command).toBe(command);
    });
    it('keeps zero dismissals already current instead of claiming mutation', () => expect(readOperationEvidence(renderSemanticReply(select('CommentAutomation.StateCommandReply', { publication: { kind: 'state-command-result', command: 'dismiss', outcome: 'completed', count: 0 } })[0]))?.outcome).toBe('already-current'));
    it.each(['changes-pushed','no-changes'])('maps trusted implementation %s without a guessed SHA', outcome => {
        const evidence = readOperationEvidence(renderSemanticReply(select('CommentAutomation.ImplementationReply', { publication: { kind: 'implementation-result', outcome, branch: 'feature/42' } })[0])); expect(evidence?.command).toBe('implement'); expect(evidence?.outcome).toBe(outcome === 'changes-pushed' ? 'applied' : 'not-applied'); expect(evidence?.commitSha).toBeUndefined();
    });
    it.each(['changes-pushed','no-changes'])('maps trusted fix %s without claiming finding closure', outcome => {
        const body = renderSemanticReply(select('CommentAutomation.FixReply', { publication: { kind: 'fix-result', outcome } })[0]); expect(readOperationEvidence(body)?.command).toBe('fix'); expect(readOperationEvidence(body)?.outcome).toBe(outcome === 'changes-pushed' ? 'applied' : 'not-applied'); if (outcome === 'changes-pushed') expect(body).toContain('independent review');
    });
    it('rejects a fix projection from an unknown producer and extra fields', () => {
        expect(select('AgentGuess', { publication: { kind: 'fix-result', outcome: 'changes-pushed' } })).toEqual([]);
        expect(select('CommentAutomation.FixReply', { publication: { kind: 'fix-result', outcome: 'changes-pushed', commitSha: 'a'.repeat(40) } })).toEqual([]);
    });
    it('publishes a history query through the reconciler projection without operation marker', () => {
        const payload = { publication: { kind: 'history-command', state: 'complete', rows: [], owner: 'acme', repository: 'widget', serverOrigin: 'https://github.com', target: { kind: 'pr', number: 42 } } };
        const first = select('CommentAutomation.History', payload); expect(first[0].messageKey).toBe('copilot-history'); const body = renderSemanticReply(first[0]); expect(body).toContain('No supported requests'); expect(readOperationEvidence(body)).toBeUndefined(); expect(select('CommentAutomation.History', payload)[0].digest).toBe(first[0].digest);
    });
    it('rejects malformed query publication instead of rendering result prose', () => expect(select('CommentAutomation.History', { publication: { kind: 'history-command', rows: ['SECRET'] } })).toEqual([]));
});
