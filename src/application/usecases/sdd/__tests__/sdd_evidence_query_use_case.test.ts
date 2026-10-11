import { renderSddGateRecord, type SddGateRecord } from '../../../../domain/pre_branch_sdd';
import { buildSddIssueDigest } from '../../../policies/sdd_issue_identity_policy';
import { bindSddEvidenceReadPorts, type SddEvidenceQueryContext, type SddEvidenceReadPorts } from '../../../ports/sdd_evidence_read_ports';
import { readCopilotStatus } from '../../read_copilot_status_workflow';
import type { CommentAutomationContext } from '../../comment_automation_context';
import { SddEvidenceQueryUseCase } from '../sdd_evidence_query_use_case';

const base = 'a'.repeat(40), first = 'b'.repeat(40), revisionBase = 'c'.repeat(40), revision = 'd'.repeat(40), head = 'e'.repeat(40);
function fixture() {
    const context: SddEvidenceQueryContext = { issueNumber: 42, admittedKind: 'feature', profileDigest: 'profile', issueAuthor: 'author',
        trustedBotLogin: 'vypbot', issueManagedBranches: true, preBranchSdd: true, baseBranch: 'develop' };
    const record: SddGateRecord = { version: 1, issueNumber: 42, phase: 'published',
        issueDigest: buildSddIssueDigest({ issueNumber: 42, issueTitle: 'Feature', issueBody: 'Human requirements', admittedKind: 'feature', profileDigest: 'profile' }, base),
        baseSha: base, round: 1, commitSha: first, branchName: 'feature/42',
        plan: { action: 'update', path: 'specs/feature.md', capabilityId: 'feature', reason: 'This capability owns the feature contract.', questions: [] } };
    const comment = (body = renderSddGateRecord(record), id = 7, author = 'vypbot') => ({ id, body, user: { login: author } });
    const comments = jest.fn(async () => ({ value: [comment()], coverage: { source: 'issue-comments' as const, status: 'complete' as const,
        pagesFetched: 1, itemsFetched: 1, itemsRetained: 1, omittedItems: 0, truncatedItems: 0, limitReached: false } }));
    const snapshot = (sha: string) => ({ baseSha: sha, template: '', standard: '', capabilities: [{ id: 'feature', title: 'Feature', status: 'implemented',
        scope: 'Feature', owner: 'Maintainer', lastVerified: '2026-10-11', specs: ['specs/feature.md'], workflows: [], entrypoints: [], code: [], tests: [], documentation: [] }] });
    const ports = {
        comments: { listIssueComments: comments }, descriptions: { getDescription: jest.fn(async () => 'Human requirements') },
        titles: { getTitle: jest.fn(async () => 'Feature') }, labels: { getLabels: jest.fn(async () => ['feature', 'in-progress']) },
        actors: { isActorAllowedToModifyFiles: jest.fn(async (author: string) => author === 'maintainer') },
        branches: { getLinkedBranch: jest.fn(async (_issue: number, _branch: string) => ({ name: 'feature/42', headSha: head })) },
        workspace: { loadSnapshot: jest.fn(async () => snapshot(base)), loadSnapshotAtCommit: jest.fn(async (sha: string) => snapshot(sha)),
            verifyPublication: jest.fn(async (_branch: string, _base: string, _sha: string, _path: string): Promise<boolean> => true),
            isAncestor: jest.fn(async (_ancestor: string, _descendant: string): Promise<boolean> => true) },
    } satisfies SddEvidenceReadPorts;
    return { context, record, ports, comments, snapshot, comment, query: new SddEvidenceQueryUseCase(ports) };
}

describe('read-only SDD authority and publication query', () => {
    it.each(['string specs', 'duplicate capability id'])('rejects malformed immutable catalog: %s', async scenario => {
        const f = fixture(); const snapshot = f.snapshot(first);
        if (scenario === 'string specs') (snapshot.capabilities[0] as unknown as { specs: unknown }).specs = 'specs/feature.md';
        else snapshot.capabilities.push({ ...snapshot.capabilities[0], specs: ['specs/other.md'] });
        f.ports.workspace.loadSnapshotAtCommit.mockResolvedValue(snapshot);
        expect(await f.query.read(f.context)).toEqual({ state: 'invalid' });
    });
    it('rejects contradictory gate configuration before reading comments', async () => {
        const f = fixture(); expect(await f.query.read({ ...f.context, issueManagedBranches: false })).toEqual({ state: 'unavailable' });
        expect(f.comments).not.toHaveBeenCalled();
    });
    it.each(['published', 'head changed', 'missing read port'])('integrates issue status safely for %s', async scenario => {
        const f = fixture();
        const statusContext = { sdd: f.context, status: { owner: 'acme', repository: 'demo', event: 'issue_comment', action: 'created', target: 'issue', issueNumber: 42,
            issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'append', sddReadiness: { state: 'unavailable', required: true } } } as unknown as CommentAutomationContext;
        if (scenario === 'head changed') f.ports.branches.getLinkedBranch.mockResolvedValueOnce({ name: 'feature/42', headSha: head }).mockResolvedValue({ name: 'feature/42', headSha: 'f'.repeat(40) });
        const result = await readCopilotStatus(statusContext, 'IssueCommentUseCase', undefined, scenario === 'missing read port' ? undefined : { read: f.query.read.bind(f.query) });
        expect(result.payload).toMatchObject({ status: { sddReadiness: {
            state: scenario === 'published' ? 'ready' : scenario === 'head changed' ? 'unverified' : 'unavailable',
        } } });
        if (scenario === 'published') expect(result.payload).toMatchObject({ status: { sddReadiness: { commitSha: first } } });
        if (scenario === 'missing read port') expect(f.comments).not.toHaveBeenCalled();
    });
    it.each([0, Number.MAX_SAFE_INTEGER + 1])('rejects an unsafe issue identifier %s before provider reads', async issueNumber => {
        const f = fixture(); expect(await f.query.read({ ...f.context, issueNumber })).toEqual({ state: 'unavailable' });
        expect(f.comments).not.toHaveBeenCalled();
    });
    it.each([true, false])('integrates a verified first publication and pending revision with questions=%s', async hasQuestions => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', round: 2,
            plan: { ...f.record.plan, questions: hasQuestions ? [{ id: 'Q1', text: 'What should the revision change?', owner: 'issue-author' }] : [] } });
        const statusContext = { sdd: f.context, status: { owner: 'acme', repository: 'demo', event: 'issue_comment', action: 'created', target: 'issue', issueNumber: 42,
            issueLabels: [], pullRequestLabels: [], pullRequestDescriptionMode: 'append', sddReadiness: { state: 'unavailable', required: true } } } as unknown as CommentAutomationContext;
        const result = await readCopilotStatus(statusContext, 'IssueCommentUseCase', undefined, { read: f.query.read.bind(f.query) });
        expect(result.payload).toMatchObject({ status: { sddReadiness: { state: 'revision-pending', firstCommitSha: first,
            pendingQuestionIds: hasQuestions ? ['Q1'] : [], path: 'specs/feature.md' } } });
        expect((result.payload as { status: { sddReadiness: { commitSha?: string } } }).status.sddReadiness.commitSha).toBeUndefined();
        expect(f.ports.workspace.verifyPublication).toHaveBeenCalledTimes(2);
    });
    it.each(['issueManagedBranches', 'admittedKind'] as const)('does not guess missing configuration %s', async field => {
        const f = fixture(); expect(await f.query.read({ ...f.context, [field]: undefined })).toEqual({ state: 'unavailable' });
        expect(f.comments).not.toHaveBeenCalled();
    });
    it.each(['original base', 'implementation before first SDD', 'changed snapshot'])('checks a retained unpublished branch against %s', async scenario => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', commitSha: undefined });
        f.ports.branches.getLinkedBranch.mockResolvedValue({ name: 'feature/42', headSha: scenario === 'implementation before first SDD' ? head : base });
        if (scenario === 'changed snapshot') f.ports.workspace.loadSnapshot.mockResolvedValue(f.snapshot(head));
        expect(await f.query.read(f.context)).toMatchObject({ state: scenario === 'original base' ? 'publication-pending' : scenario === 'changed snapshot' ? 'stale' : 'invalid' });
        expect(f.ports.workspace.verifyPublication).not.toHaveBeenCalled();
    });
    it('reports unavailable rather than guessing the source of an unpublished branchless SDD', async () => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', commitSha: undefined, branchName: undefined });
        expect(await f.query.read({ ...f.context, baseBranch: undefined })).toEqual({ state: 'unavailable' });
    });
    it('requires immutable ownership again at the current revision', async () => {
        const f = fixture(); Object.assign(f.record, { revisionSha: revision, revisionBaseSha: revisionBase });
        f.ports.workspace.loadSnapshotAtCommit.mockImplementation(async sha => ({ ...f.snapshot(sha), capabilities: sha === revision ? [] : f.snapshot(sha).capabilities }));
        expect(await f.query.read(f.context)).toEqual({ state: 'invalid' });
    });
    it('withholds current revision readiness when publication proof disappears during the final fence', async () => {
        const f = fixture(); Object.assign(f.record, { revisionSha: revision, revisionBaseSha: revisionBase });
        f.ports.workspace.verifyPublication.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
        expect(await f.query.read(f.context)).toEqual({ state: 'stale' });
    });
    it.each(['issue-author', 'maintainer'] as const)('accepts exact current retained answer provenance for %s', async owner => {
        const f = fixture(); const text = 'What should this current behavior be?';
        Object.assign(f.record, { phase: 'awaiting-answer', round: 2, plan: { ...f.record.plan, questions: [{ id: 'Q1', text, owner }] },
            answers: [{ questionId: 'Q1', author: owner === 'maintainer' ? 'maintainer' : 'author', commentId: 6, text: 'Verified current choice', round: 2, questionText: text }] });
        expect(await f.query.read(f.context)).toMatchObject({ state: 'publication-pending', pendingQuestionIds: [] });
    });
    it('does not keep a retained maintainer answer valid after permission is revoked', async () => {
        const f = fixture(); const text = 'What should this current behavior be?';
        Object.assign(f.record, { phase: 'awaiting-answer', round: 2, plan: { ...f.record.plan, questions: [{ id: 'Q1', text, owner: 'maintainer' }] },
            answers: [{ questionId: 'Q1', author: 'former-maintainer', commentId: 6, text: 'Old authorization', round: 2, questionText: text }] });
        expect(await f.query.read(f.context)).toMatchObject({ state: 'awaiting-answers', pendingQuestionIds: ['Q1'] });
    });
    it('invalidates the question projection if a new authorized answer arrives during its final fence', async () => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', plan: { ...f.record.plan, questions: [{ id: 'Q1', text: 'What should this behavior be?', owner: 'issue-author' }] } });
        const initial = await f.comments(); f.comments.mockResolvedValueOnce(initial).mockResolvedValue({ ...initial, value: [...initial.value, f.comment('SDD Q1: New answer', 8, 'author')] });
        expect(await f.query.read(f.context)).toEqual({ state: 'stale' });
    });
    it('loses readiness if the first publication no longer verifies at the final fence', async () => {
        const f = fixture(); f.ports.workspace.verifyPublication.mockResolvedValueOnce(true).mockResolvedValue(false);
        expect(await f.query.read(f.context)).toEqual({ state: 'stale' });
    });
    it('reports the immutable first publication only after remote proof and a final fence', async () => {
        const f = fixture();
        expect(await f.query.read(f.context)).toMatchObject({ state: 'published', path: 'specs/feature.md', cardId: 7,
            verified: { firstSha: first, currentSha: first, branchHeadSha: head } });
        expect(f.ports.workspace.verifyPublication).toHaveBeenCalledTimes(2);
        expect(f.comments).toHaveBeenCalledTimes(2);
    });
    it('verifies both publications while accepting an update to a previously published companion', async () => {
        const f = fixture(); Object.assign(f.record, { revisionSha: revision, revisionBaseSha: revisionBase });
        expect(await f.query.read(f.context)).toMatchObject({ state: 'published', verified: { firstSha: first, currentSha: revision } });
        expect(f.ports.workspace.isAncestor).toHaveBeenCalledWith(first, revisionBase);
        expect(f.ports.workspace.loadSnapshotAtCommit.mock.calls.map(call => call[0])).toEqual([first, revision]);
    });
    it.each(['missing owner', 'duplicate owner'])('rejects %s at the immutable publication', async scenario => {
        const f = fixture();
        const snapshot = f.snapshot(first);
        snapshot.capabilities = scenario === 'missing owner' ? [] : [...snapshot.capabilities, { ...snapshot.capabilities[0], id: 'foreign' }];
        f.ports.workspace.loadSnapshotAtCommit.mockResolvedValue(snapshot);
        expect(await f.query.read(f.context)).toEqual({ state: 'invalid' });
    });
    it.each(['first', 'revision'])('rejects an unverified %s publication', async publication => {
        const f = fixture(); Object.assign(f.record, { revisionSha: revision, revisionBaseSha: revisionBase });
        f.ports.workspace.verifyPublication.mockImplementation(async (_branch, _base, sha) => sha !== (publication === 'first' ? first : revision));
        expect(await f.query.read(f.context)).toEqual({ state: 'invalid' });
    });
    it.each(['first remote ancestry', 'revision base ancestry'])('rejects broken %s', async ancestry => {
        const f = fixture(); Object.assign(f.record, { revisionSha: revision, revisionBaseSha: revisionBase });
        f.ports.workspace.isAncestor.mockImplementation(async (_ancestor, descendant) => descendant !== (ancestry === 'first remote ancestry' ? head : revisionBase));
        expect(await f.query.read(f.context)).toEqual({ state: 'invalid' });
    });
    it.each(['different branch', 'abbreviated SHA'])('does not guess from %s linkage', async linkage => {
        const f = fixture(); f.ports.branches.getLinkedBranch.mockResolvedValue({ name: linkage === 'different branch' ? 'feature/43' : 'feature/42', headSha: linkage === 'abbreviated SHA' ? 'abc123' : head });
        expect(await f.query.read(f.context)).toEqual({ state: 'invalid' });
        expect(f.ports.workspace.verifyPublication).not.toHaveBeenCalled();
    });
    it('withholds readiness after a real issue edit while retaining only verified historical evidence', async () => {
        const f = fixture(); f.ports.descriptions.getDescription.mockResolvedValue('Changed requirements');
        expect(await f.query.read(f.context)).toMatchObject({ state: 'stale', verified: { firstSha: first } });
    });
    it('authorizes a repeated candidate account once across questions and login case variants', async () => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', plan: { ...f.record.plan, questions: [
            { id: 'Q1', text: 'First decision?', owner: 'maintainer' }, { id: 'Q2', text: 'Second decision?', owner: 'maintainer' },
        ] } });
        const current = await f.comments(); current.value.push(f.comment('SDD Q1: Proposed choice', 9, 'untrusted'), f.comment('SDD Q2: Proposed choice', 10, 'UNTRUSTED'));
        f.comments.mockResolvedValue(current);
        expect(await f.query.read(f.context)).toMatchObject({ state: 'awaiting-answers', pendingQuestionIds: ['Q1', 'Q2'] });
        expect(f.ports.actors.isActorAllowedToModifyFiles).toHaveBeenCalledTimes(1);
    });
    it('never carries cached authorization into a subsequent status query', async () => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', plan: { ...f.record.plan,
            questions: [{ id: 'Q1', text: 'Current decision?', owner: 'maintainer' }] } });
        const current = await f.comments(); current.value.push(f.comment('SDD Q1: Current choice', 9, 'candidate')); f.comments.mockResolvedValue(current);
        f.ports.actors.isActorAllowedToModifyFiles.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        expect(await f.query.read(f.context)).toMatchObject({ state: 'awaiting-answers' });
        expect(await f.query.read(f.context)).toMatchObject({ state: 'publication-pending', pendingQuestionIds: [] });
        expect(f.ports.actors.isActorAllowedToModifyFiles).toHaveBeenCalledTimes(2);
    });
    it.each([16, 17])('bounds distinct maintainer candidates to 16 lookups with %s candidates', async candidates => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', plan: { ...f.record.plan,
            questions: [{ id: 'Q1', text: 'Current decision?', owner: 'maintainer' }] } });
        const current = await f.comments(); for (let i = 0; i < candidates; i++) current.value.push(f.comment('SDD Q1: Proposed choice', 9 + i, `candidate-${i}`));
        f.comments.mockResolvedValue(current);
        expect(await f.query.read(f.context)).toMatchObject({ state: candidates === 16 ? 'awaiting-answers' : 'unavailable' });
        expect(f.ports.actors.isActorAllowedToModifyFiles).toHaveBeenCalledTimes(16);
    });
    it('shares one authorization for retained and live answers without changing answer provenance', async () => {
        const f = fixture(); const text = 'Current decision?'; Object.assign(f.record, { phase: 'awaiting-answer', plan: { ...f.record.plan,
            questions: [{ id: 'Q1', text, owner: 'maintainer' }] }, answers: [{ questionId: 'Q1', author: 'untrusted', commentId: 6,
            text: 'Retained choice', round: 1, questionText: text }] });
        const current = await f.comments(); current.value.push(f.comment('SDD Q1: Current choice', 9, 'UNTRUSTED')); f.comments.mockResolvedValue(current);
        expect(await f.query.read(f.context)).toMatchObject({ state: 'awaiting-answers', pendingQuestionIds: ['Q1'] });
        expect(f.ports.actors.isActorAllowedToModifyFiles).toHaveBeenCalledTimes(1);
    });
    it('does not spend the maintainer API budget on issue-author questions', async () => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', plan: { ...f.record.plan,
            questions: [{ id: 'Q1', text: 'Author decision?', owner: 'issue-author' }] } });
        const current = await f.comments(); for (let i = 0; i < 17; i++) current.value.push(f.comment('SDD Q1: Proposed choice', 9 + i, `candidate-${i}`));
        f.comments.mockResolvedValue(current);
        expect(await f.query.read(f.context)).toMatchObject({ state: 'awaiting-answers', pendingQuestionIds: ['Q1'] });
        expect(f.ports.actors.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
    });
    it('contains a denied authorization and retries it freshly on the next query', async () => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', plan: { ...f.record.plan,
            questions: [{ id: 'Q1', text: 'Current decision?', owner: 'maintainer' }] } });
        const current = await f.comments(); current.value.push(f.comment('SDD Q1: Current choice', 9, 'candidate')); f.comments.mockResolvedValue(current);
        f.ports.actors.isActorAllowedToModifyFiles.mockRejectedValueOnce(new Error('PRIVATE-CREDENTIAL')).mockResolvedValueOnce(true);
        expect(await f.query.read(f.context)).toEqual({ state: 'unavailable' });
        expect(await f.query.read(f.context)).toMatchObject({ state: 'publication-pending' });
        expect(f.ports.actors.isActorAllowedToModifyFiles).toHaveBeenCalledTimes(2);
    });
    it('never restores readiness from an older valid card after the latest owned card is corrupted', async () => {
        const f = fixture(); f.comments.mockResolvedValue({ ...(await f.comments()), value: [f.comment(), f.comment('<!-- copilot:sdd-gate:v1\nbad\n-->', 8)] });
        expect(await f.query.read(f.context)).toEqual({ state: 'invalid' });
    });
    it('ignores a copied publication by a foreign author', async () => {
        const f = fixture(); f.comments.mockResolvedValue({ ...(await f.comments()), value: [f.comment(), f.comment('<!-- copilot:sdd-gate:v1\nbad\n-->', 8, 'human')] });
        expect(await f.query.read(f.context)).toMatchObject({ state: 'published' });
    });
    it('keeps a reused Q1 pending when its retained answer belongs to the previous round', async () => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', round: 2,
            plan: { ...f.record.plan, questions: [{ id: 'Q1', text: 'What should the new behavior be?', owner: 'issue-author' }] },
            answers: [{ questionId: 'Q1', author: 'author', commentId: 6, text: 'Old choice', round: 1, questionText: 'What was the previous behavior?' }] });
        expect(await f.query.read(f.context)).toMatchObject({ state: 'awaiting-answers', pendingQuestionIds: ['Q1'], verified: { firstSha: first } });
    });
    it.each(['issue-author', 'maintainer'])('accepts only a current answer authorized for %s', async owner => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', plan: { ...f.record.plan, questions: [{ id: 'Q1', text: 'What should this behavior be?', owner }] } });
        const current = await f.comments(); current.value.push(f.comment('SDD Q1: Keep the verified behavior.', 9, owner === 'maintainer' ? 'maintainer' : 'author'));
        f.comments.mockResolvedValue(current);
        expect(await f.query.read(f.context)).toMatchObject({ state: 'publication-pending', pendingQuestionIds: [] });
    });
    it.each(['human', 'vypbot'])('does not consume a pending answer by %s', author => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', plan: { ...f.record.plan, questions: [{ id: 'Q1', text: 'What should this behavior be?', owner: 'issue-author' }] } });
        return f.comments().then(async current => {
            current.value.push(f.comment('SDD Q1: An unauthorized answer.', 9, author)); f.comments.mockResolvedValue(current);
            expect(await f.query.read(f.context)).toMatchObject({ state: 'awaiting-answers', pendingQuestionIds: ['Q1'] });
        });
    });
    it('reports first publication pending from validated new-owner metadata without a branch', async () => {
        const f = fixture(); Object.assign(f.record, { phase: 'awaiting-answer', commitSha: undefined, branchName: undefined,
            plan: { ...f.record.plan, action: 'companion', path: 'specs/new-feature.md' } });
        expect(await f.query.read(f.context)).toMatchObject({ state: 'publication-pending', path: 'specs/new-feature.md', pendingQuestionIds: [] });
        expect(f.ports.workspace.verifyPublication).not.toHaveBeenCalled();
    });
    it('distinguishes absent evidence from a malformed publication', async () => {
        const f = fixture(); f.comments.mockResolvedValue({ ...(await f.comments()), value: [] });
        expect(await f.query.read(f.context)).toEqual({ state: 'absent' });
    });
    it('does not turn partial provider inventory into an absent or ready result', async () => {
        const f = fixture(); const incomplete = await f.comments(); incomplete.coverage.limitReached = true; f.comments.mockResolvedValue(incomplete);
        expect(await f.query.read(f.context)).toEqual({ state: 'unavailable' });
    });
    it.each(['issue edit', 'card edit', 'branch push', 'label edit'])('loses readiness when the final fence observes %s', async mutation => {
        const f = fixture();
        if (mutation === 'issue edit') f.ports.descriptions.getDescription.mockResolvedValueOnce('Human requirements').mockResolvedValue('New requirements');
        if (mutation === 'card edit') {
            const initial = await f.comments();
            f.comments.mockResolvedValueOnce(initial).mockResolvedValue({ ...initial, value: [f.comment('## SDD work status\nmissing evidence')] });
        }
        if (mutation === 'branch push') f.ports.branches.getLinkedBranch.mockResolvedValueOnce({ name: 'feature/42', headSha: head }).mockResolvedValue({ name: 'feature/42', headSha: 'f'.repeat(40) });
        if (mutation === 'label edit') f.ports.labels.getLabels.mockResolvedValueOnce(['feature', 'in-progress']).mockResolvedValue(['feature']);
        expect(await f.query.read(f.context)).toEqual({ state: 'stale' });
    });
    it('does not infer disabled gate configuration from missing legacy fields', async () => {
        const f = fixture(); expect(await f.query.read({ ...f.context, preBranchSdd: undefined })).toEqual({ state: 'unavailable' });
        expect(f.comments).not.toHaveBeenCalled();
    });
    it('keeps help branchless without reading publication or comment authority', async () => {
        const f = fixture(); expect(await f.query.read({ ...f.context, admittedKind: 'help' })).toEqual({ state: 'not-required' });
        expect(f.comments).not.toHaveBeenCalled();
    });
    it('uses canonical admission and start policy rather than the SDD output label', async () => {
        const f = fixture(); f.ports.labels.getLabels.mockResolvedValue(['feature', 'SDD']);
        expect(await f.query.read(f.context)).toEqual({ state: 'not-required' });
        expect(f.ports.workspace.verifyPublication).not.toHaveBeenCalled();
    });
    it('returns unavailable after an authority read fails without exposing the provider error', async () => {
        const f = fixture(); f.comments.mockRejectedValue(new Error('private provider response'));
        expect(await f.query.read(f.context)).toEqual({ state: 'unavailable' });
    });
    it('physically excludes source, label, publication and agent mutation methods from bound capabilities', () => {
        const f = fixture(); Object.assign(f.ports.labels, { setLabels: jest.fn() }); Object.assign(f.ports.workspace, { publish: jest.fn(), validateDraft: jest.fn() });
        const bound = bindSddEvidenceReadPorts(f.ports);
        expect(Object.keys(bound.labels)).toEqual(['getLabels']);
        expect(Object.keys(bound.workspace)).toEqual(['loadSnapshot', 'loadSnapshotAtCommit', 'verifyPublication', 'isAncestor']);
        expect(Object.isFrozen(bound)).toBe(true); expect(Object.isFrozen(bound.workspace)).toBe(true);
    });
});
