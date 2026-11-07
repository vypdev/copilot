import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ai } from '../../../../data/model/ai';
import type { Execution } from '../../../../data/model/execution';
import { FindingsAgentAdapter } from '../../../../data/repository/ai/findings_agent_adapter';
import { readSddGateRecord, composeSddUpdate, type SddGateRecord } from '../../../../domain/pre_branch_sdd';
import { renderSddDerivedTables } from '../../../../domain/sdd_draft_consistency';
import { ALL_ISSUE_WORKFLOWS } from '../../../../domain/issue_workflow_profile';
import { issueWorkflowProfileDigest } from '../../../../utils/issue_workflow_profile_digest';
import { captureProgressScopeSource } from '../../../policies/progress_scope_source_policy';
import { reconcileProgressSddScope } from '../../../policies/progress_sdd_scope_policy';
import { parseProgressScopeWithAnchors } from '../../../policies/progress_scope_policy';
import { readSddSeed, sddArtifactDigest, sddSelectionReceipt } from '../../../policies/sdd_selection_policy';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';
import { createProgressSddSeedQuery, expectsPublishedProgressSeed } from '../../sdd/read_progress_sdd_seed';
import { CheckProgressUseCase } from '../check_progress_use_case';
import { CommitUseCase } from '../../commit_use_case';
import { resolveStaticApplicationErrorCatalog } from '../../../policies/application_error_message_catalog';
import { buildApplicationErrorPresentation } from '../../../policies/application_error_presentation_policy';

const read = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const body = read('domus-30-issue.md');
const { title, comments } = JSON.parse(read('domus-30-selection.json')) as {
    title: string; comments: { id: number; user: { login: string }; body: string | null }[];
};
const originalOwner = read('domus-30-original-owner.md');
const seed = readSddSeed(body);
if (seed.seed === undefined) throw new Error('The captured issue is missing its seed');
const rendered = renderSddDerivedTables(seed.seed);
const published = composeSddUpdate(originalOwner, rendered);

const branch = 'feature/30-share-gateway-presentation-components-and-establish-the-domus-household-navigation';
const base = '0170085f283ea5775f41e77a2f8c8d9cc69f20b7';
const publication = '3ee15afc4942c7f663d09b58928513ea72c8cbcd';
const head = '82b7e0f72e57ff61b0331bfb1499ea1a66bc2b6f';
const path = 'specs/application-experience.md';
const artifact = '2814c90f0cba5206a07c9af9989297e364852593415fbc176842bf81c088138c';
const repositoryUrl = 'https://github.com/vypdev/domus';
const profileDigest = issueWorkflowProfileDigest(ALL_ISSUE_WORKFLOWS);
const evidence = { issueUrl: repositoryUrl + '/issues/30', cardId: 6693447714, path, commitSha: publication, artifactHash: artifact };
const scoped = reconcileProgressSddScope(captureProgressScopeSource(body), seed, evidence);
const goal = (number: string) => scoped.lines.find(line => line.quote.startsWith('| G-' + number))!.id;

function fixture(description = body, bindSeedQuery = true, includePublishedCard = false) {
    const coverage = { source: 'issue-comments' as const, status: 'complete' as const, limitReached: false, providerLimitReached: false,
        omittedItems: 0, truncatedItems: 0, pagesFetched: 1, itemsFetched: comments.length, itemsRetained: comments.length };
    const reads = {
        titles: { getTitle: jest.fn(async () => title) },
        comments: { listIssueComments: jest.fn(async () => ({ coverage, value: comments })) },
        actors: { isActorAllowedToModifyFiles: jest.fn(async () => true) },
        branches: { getLinkedBranch: jest.fn(async () => ({ name: branch, headSha: head })) },
        workspace: {
            verifyPublication: jest.fn(async () => true),
            isAncestor: jest.fn(async () => true),
            readSdd: jest.fn(async (sha: string): Promise<string | undefined> => sha === base ? originalOwner : published),
        },
    };
    const execute = jest.fn(async (request: { outputSchema?: unknown; prompt: string }) => {
        const schema = request.outputSchema as Record<string, any>;
        if (schema.properties.lines) {
            const properties = schema.properties.lines.items.properties;
            const canonical = properties.sameAs?.enum.slice(1) ?? [];
            const ids: string[] = properties.id.enum;
            const distinct = new Set(['L11', 'L40', 'L60', 'L64', 'L68', 'L72', 'L76', 'L80', 'L84', 'L88', 'L92', 'L113', 'L143', 'L155', 'L168']);
            const lines = ids.map(id => ({ id,
                kind: canonical.includes(id) || distinct.has(id) || !canonical.length ? 'required' : id === 'L56' ? 'excluded' : 'context',
                ...(canonical.length ? { sameAs: 'none' } : {}),
            }));
            return JSON.stringify({ outputLocale: 'en-US', lines });
        }
        return JSON.stringify({ outputLocale: 'en-US', progress: 50,
            requirements: schema.properties.requirements.items.properties.id.enum.map((id: string) => ({
                id, status: 'verification-unknown', evidence: 'external-unverified', summary: 'Implementation evidence observed.',
                remaining: 'Independent verification pending.',
            })) });
    });
    const setProgressLabel = jest.fn();
    const readSeed = jest.fn(createProgressSddSeedQuery(reads, repositoryUrl));
    const progress = new CheckProgressUseCase({ getDescription: async () => description },
        { getLabels: async () => [], setLabels: jest.fn() }, { setProgressLabel },
        { getListOfBranches: async () => [] }, { getOpenPullRequestNumbersByHeadBranch: async () => [] },
        new FindingsAgentAdapter({ cli: { execute } }),
        { isIssueOpen: async () => true, getBranchHeadSha: async ref => ref === 'develop' ? base : head },
        { getDiff: async () => partitionProgressDiff(base, head, [{ path: 'src/app.ts', status: 'modified', additions: 1, deletions: 0, patch: '+source' }]) },
        { getSource: async () => ({ kind: 'none' }) },
        { listIssueComments: async () => includePublishedCard ? comments.map(comment => ({ ...comment, body: comment.body ?? '' })) : [],
            removeFullProgressLabel: jest.fn() },
        bindSeedQuery ? readSeed : undefined);
    const noWork = { taskId: 'independent', invoke: async () => [] };
    const commit = new CommitUseCase(noWork, noWork, noWork, progress);
    const ai = new Ai('', 'model', false, [], false, 'low', 20);
    jest.spyOn(ai, 'getAgentConfiguration').mockReturnValue({ provider: 'codex', model: 'fixture' });
    const execution = {
        owner: 'vypdev', repo: 'domus', tokenUser: 'vypbot', issueNumber: 30, issueWorkflowKind: 'feature',
        issueWorkflowProfileDigest: profileDigest, issue: { number: 30, reopenOnPush: false },
        eventName: 'push', inputs: { after: head }, locale: { issue: 'en-US', pullRequest: 'en-US' },
        currentConfiguration: { parentBranch: 'develop' }, pullRequest: { number: -1, head: '', action: '' },
        commit: { branch, commits: [{ id: head }] },
        branches: { development: 'develop', featureTree: 'feature', bugfixTree: 'bugfix', docsTree: 'docs', choreTree: 'chore' },
        labels: { currentIssueLabels: [], currentPullRequestLabels: [] }, sizeThresholds: {}, project: { getProjects: () => [] },
        ai,
    } as unknown as Execution;
    return { run: async () => (await commit.invoke(execution))[0], reads, execute, setProgressLabel, readSeed };
}

it('reproduces the released source inventory and preserves all 12 original case rows as evidence', () => {
    const original = captureProgressScopeSource(body);
    expect(sddArtifactDigest(body)).toBe('862846e67f864f07438050e882459228f80bbec403db3bff423438c730235367');
    expect(original).toMatchObject({ totalLines: 121, operationalLines: 8 });
    expect(original.lines).toHaveLength(113);
    expect(original.lines.filter(line => +line.id.slice(1) > 17 && +line.id.slice(1) < 160)).toHaveLength(97);
    expect(original.lines.find(line => line.id === 'L109')?.quote).toContain('domus-shared-nav-C12');
    expect(sddArtifactDigest(published)).toBe(artifact);
    expect(scoped.lines).toHaveLength(99);
    expect(seed).toMatchObject({ openingMarkerLine: 17, closingMarkerLine: 160 });
    expect(scoped.draft?.required).toEqual(new Set(['L45', 'L46', 'L47', 'L48', 'L49', 'L50']));
    expect(scoped.lines.some(line => line.id === 'L109')).toBe(false);
    const simulated = new Set(['L11', 'L40', 'L60', 'L64', 'L68', 'L72', 'L76', 'L80', 'L84', 'L88', 'L92', 'L113', 'L143', 'L155', 'L168', 'L26']);
    for (const id of scoped.draft!.required) simulated.add(id);
    for (const lines of scoped.draft!.evidence.values()) for (const line of lines) simulated.add(line.id);
    const classification = original.lines.map(line => ({ id: line.id, kind: simulated.has(line.id) ? 'required' : 'context' }));
    expect(() => parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines: classification }, original, 'en-US')).toThrow(
        expect.objectContaining({ recovery: { id: 'progress-scope-clause-limit', variables: expect.objectContaining({ limit: 32, observed: 33 }) } }),
    );
    const cases = new Set([...scoped.draft!.evidence.values()].flat().map(line => line.id));
    expect(cases.size).toBe(12);
    expect(scoped.draft?.evidence.get(goal('06'))).toContainEqual(expect.objectContaining({ id: 'L109', origin: 'draft' }));
});

it('runs Commit through the authorized publication and complete simulated assessment', async () => {
    const f = fixture();
    const result = await f.run();
    expect(result.errors.map(error => error.message)).toEqual([]);
    expect(result).toMatchObject({ success: true, payload: { progress: 50, sourceHeadSha: head } });
    expect(f.setProgressLabel).toHaveBeenCalledWith(30, 50);
    expect(f.readSeed).toHaveBeenCalledTimes(2);
    expect(f.reads.workspace.verifyPublication).toHaveBeenCalledWith(branch, base, publication, path);
    expect(f.reads.workspace.isAncestor).toHaveBeenCalledWith(publication, head);
    const classifier = f.execute.mock.calls[0][0].prompt;
    expect(classifier).not.toContain('domus-shared-nav-C12');
    expect(classifier).not.toContain('copilot-configuration-start');
    const assessment = f.execute.mock.calls[1][0].prompt;
    expect(assessment).toContain(artifact);
    expect(assessment).toContain('"id":"L109","quote":"| domus-shared-nav-C12');
    expect(assessment).toContain('"id":"L11","quote":');
    expect((result.payload as { summary: string }).summary.match(/\[R\d+\]/gu)).toHaveLength(20);
});

it('deduplicates an exact goal restatement and keeps its two origins and the draft-only goal', () => {
    const restated = 'Install and lock the exact public npm version and integrity, retaining its published license notices in the compiled distribution.';
    const issue = body.replace('User Interface', restated);
    const replacement = readSddSeed(issue);
    if (!replacement.seed) throw new Error('Fixture draft unavailable');
    const source = reconcileProgressSddScope(captureProgressScopeSource(issue), replacement, evidence);
    const lines = source.lines.map(line => ({ id: line.id, kind: source.draft!.required.has(line.id) ? 'required' : 'context', sameAs: 'none' }));
    const { scope, anchors } = parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines }, source, 'en-US');
    expect(scope.requirements).toHaveLength(6);
    expect(scope.requirements[0].sources).toContainEqual({ id: 'L7', quote: restated, origin: 'issue' });
    expect(scope.requirements[0].sources?.[0]).toMatchObject({ origin: 'draft', id: anchors.R1 });
    expect(scope.requirements[5]).toMatchObject({ id: 'R6', quote: expect.stringContaining('G-06'),
        sources: expect.arrayContaining([expect.objectContaining({ id: 'L109', origin: 'draft' })]) });
});

it.each([
    ['unselected', (f: ReturnType<typeof fixture>) => f.reads.comments.listIssueComments.mockImplementation(async () => {
        const snapshot = await fixture().reads.comments.listIssueComments();
        return { ...snapshot, value: snapshot.value.filter(comment => comment.id !== 6693404686) };
    })],
    ['unpublished', (f: ReturnType<typeof fixture>) => f.reads.workspace.verifyPublication.mockResolvedValue(false)],
    ['different draft on the assessed revision', (f: ReturnType<typeof fixture>) => f.reads.workspace.readSdd.mockImplementation(async sha => sha === head ? published + 'Changed.' : published)],
    ['unrelated publication', (f: ReturnType<typeof fixture>) => f.reads.workspace.isAncestor.mockResolvedValue(false)],
    ['wrong linked head', (f: ReturnType<typeof fixture>) => f.reads.branches.getLinkedBranch.mockResolvedValue({ name: branch, headSha: base })],
    ['unauthorized review', (f: ReturnType<typeof fixture>) => f.reads.actors.isActorAllowedToModifyFiles.mockResolvedValue(false)],
] as const)('retains existing progress for %s', async (_label, arrange) => {
    const f = fixture(); arrange(f);
    const result = await f.run();
    expect(result).toMatchObject({ success: false, errors: [expect.objectContaining({ recovery: { id: 'progress-sdd-seed-unverified', variables: {} } })] });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.setProgressLabel).not.toHaveBeenCalled();
});

it.each([
    ['changed seed', body.replace('Domus recognizes the two fixed fragments', 'Domus recognizes three fragments')],
    ['changed visible issue', body.replace('Gateway adoption is deferred.', 'Gateway adoption is required.')],
    ['unclosed seed', body.replace('<!-- /copilot:sdd-seed -->', '')],
])('retains progress with an actionable diagnostic for %s', async (_label, description) => {
    const f = fixture(description);
    const result = await f.run();
    expect(result.success).toBe(false);
    expect(buildApplicationErrorPresentation(result.errors[0], resolveStaticApplicationErrorCatalog('en-US').message).action).toContain('verified SDD publication');
    expect(buildApplicationErrorPresentation(result.errors[0], resolveStaticApplicationErrorCatalog('es-ES').message).action).toContain('publicación verificada');
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.setProgressLabel).not.toHaveBeenCalled();
});

it('retains progress when SDD authority changes during assessment', async () => {
    const f = fixture();
    f.readSeed.mockResolvedValueOnce(evidence).mockResolvedValueOnce({ ...evidence, cardId: evidence.cardId + 1 });
    expect((await f.run()).success).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.setProgressLabel).not.toHaveBeenCalled();
});

it('keeps 33 distinct clauses blocked in Commit even with a verified draft', async () => {
    const issue = [...Array.from({ length: 27 }, (_, index) => `Retain record ${index + 1}.`), body].join('\n');
    const f = fixture(issue);
    f.readSeed.mockResolvedValue(evidence);
    f.execute.mockImplementationOnce(async request => {
        const schema = request.outputSchema as Record<string, any>;
        const properties = schema.properties.lines.items.properties;
        const canonical = properties.sameAs.enum.slice(1);
        const lines = properties.id.enum.map((id: string, index: number) => ({
            id, kind: index < 27 || canonical.includes(id) ? 'required' : 'context', sameAs: 'none',
        }));
        return JSON.stringify({ outputLocale: 'en-US', lines });
    });
    expect(await f.run()).toMatchObject({ success: false, errors: [expect.objectContaining({
        recovery: { id: 'progress-scope-clause-limit', variables: { clauseKind: 'required-or-uncertain', observed: 33, limit: 32, sourceLineId: 'L77' } },
    })] });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.setProgressLabel).not.toHaveBeenCalled();
});

it('keeps ordinary issue scope and Action configuration separate without looking up an SDD', async () => {
    const f = fixture('Keep credential checks.\n<!-- copilot-configuration-start\n{"schemaVersion":3}\ncopilot-configuration-end -->');
    expect((await f.run()).success).toBe(true);
    expect(f.readSeed).not.toHaveBeenCalled();
    expect(f.execute.mock.calls[0][0].prompt).not.toContain('copilot-configuration-start');
});


it.each([
    ['a paraphrase of the same draft goal', 'required', goal('01'), true],
    ['an uncertain repeat', 'uncertain', goal('01'), false],
    ['an unknown source', 'required', 'L999', false],
    ['a classified exclusion', 'excluded', goal('01'), false],
])('accepts or rejects %s without losing the original text', (_label, kind, sameAs, accepted) => {
    const issue = body.replace('User Interface', 'Pin the precise published npm version and integrity and ship its license notices in the compiled output.');
    const input = readSddSeed(issue);
    if (!input.seed) throw new Error('Fixture draft unavailable');
    const source = reconcileProgressSddScope(captureProgressScopeSource(issue), input, evidence);
    const lines = source.lines.map(line => line.id === 'L7' ? { id: line.id, kind, sameAs } : ({
        id: line.id, kind: source.draft!.required.has(line.id) ? 'required' : 'context', sameAs: 'none',
    }));
    const parse = () => parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines }, source, 'en-US');
    if (accepted) {
        const { scope } = parse();
        expect(scope.requirements).toHaveLength(6);
        expect(scope.requirements[0].sources).toContainEqual(expect.objectContaining({ id: 'L7', origin: 'issue', quote: expect.stringContaining('precise published npm') }));
    } else {
        expect(parse).toThrow(expect.objectContaining({ recovery: expect.objectContaining({ id: 'progress-result-contract-invalid' }) }));
    }
});

it('does not allow the classifier to demote a draft-only requirement', () => {
    const lines = scoped.lines.map(line => ({
        id: line.id, kind: scoped.draft!.required.has(line.id) && line.id !== goal('06') ? 'required' : 'context', sameAs: 'none',
    }));
    expect(() => parseProgressScopeWithAnchors({ outputLocale: 'en-US', lines }, scoped, 'en-US')).toThrow(
        expect.objectContaining({ recovery: expect.objectContaining({ variables: expect.objectContaining({ sourceLineId: goal('06') }) }) }),
    );
});


function gateComments(record: SddGateRecord) {
    return comments.map(comment => comment.id === evidence.cardId
        ? { ...comment, body: '<!-- copilot:sdd-gate:v1\n' + JSON.stringify(record) + '\n-->' }
        : comment);
}

const originalCard = readSddGateRecord(comments.find(comment => comment.id === evidence.cardId)!.body!, 30)!;
const gateFailure = (result: Awaited<ReturnType<ReturnType<typeof fixture>['run']>>) => {
    expect(result).toMatchObject({ success: false, errors: [expect.objectContaining({ recovery: { id: 'progress-sdd-seed-unverified', variables: {} } })] });
};

it.each([
    ['missing card', (f: ReturnType<typeof fixture>) => f.reads.comments.listIssueComments.mockImplementation(async () => ({
        ...await fixture().reads.comments.listIssueComments(), value: comments.filter(comment => comment.id !== evidence.cardId),
    }))],
    ['missing recorded decisions', (f: ReturnType<typeof fixture>) => f.reads.comments.listIssueComments.mockImplementation(async () => ({
        ...await fixture().reads.comments.listIssueComments(), value: gateComments({ ...originalCard, answers: undefined }),
    }))],
    ['deleted review text', (f: ReturnType<typeof fixture>) => f.reads.comments.listIssueComments.mockImplementation(async () => ({
        ...await fixture().reads.comments.listIssueComments(), value: comments.map(comment => comment.id === 6693327200 ? { ...comment, body: null } : comment),
    }))],
    ['deleted selection text', (f: ReturnType<typeof fixture>) => f.reads.comments.listIssueComments.mockImplementation(async () => ({
        ...await fixture().reads.comments.listIssueComments(), value: comments.map(comment => comment.id === 6693404686 ? { ...comment, body: null } : comment),
    }))],
    ['missing immutable owner', (f: ReturnType<typeof fixture>) => f.reads.workspace.readSdd.mockImplementation(async sha => sha === base ? undefined : published)],
    ['owner bytes do not produce the recorded artifact', (f: ReturnType<typeof fixture>) => f.reads.workspace.readSdd.mockImplementation(async sha => sha === base ? originalOwner + '\nRetained text.\n' : published)],
] as const)('rejects %s before querying the model', async (_label, arrange) => {
    const f = fixture(); arrange(f);
    gateFailure(await f.run());
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.setProgressLabel).not.toHaveBeenCalled();
});

it('checks the exact standalone artifact for a selected companion seed', async () => {
    const f = fixture();
    const plan = { ...originalCard.plan, action: 'companion' as const };
    const selection = originalCard.selection!;
    const receipt = sddSelectionReceipt(originalCard, plan, 'seed', seed.hash!, undefined, evidence.issueUrl);
    const record = { ...originalCard, plan, selection: { ...selection, receipt }, selectionArtifact: sddArtifactDigest(rendered),
        answers: originalCard.answers!.map(answer => ({ ...answer, text: answer.text.replace(selection.receipt, receipt) })) };
    const original = await f.reads.comments.listIssueComments();
    f.reads.comments.listIssueComments.mockResolvedValue({
        ...original, value: gateComments(record).map(comment => ({ ...comment, body: comment.body!.replace(selection.receipt, receipt) })),
    });
    f.reads.workspace.readSdd.mockResolvedValue(rendered);
    expect((await f.run()).success).toBe(true);
    expect(f.reads.workspace.readSdd).not.toHaveBeenCalledWith(base, path);
});

it('retains progress when the draft query is unavailable to this caller', async () => {
    const f = fixture(body, false);
    gateFailure(await f.run());
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.setProgressLabel).not.toHaveBeenCalled();
});

it('rejects an inconsistent source row identity before reconciling', () => {
    const source = captureProgressScopeSource(body);
    expect(() => reconcileProgressSddScope({ ...source, lines: source.lines.filter(line => line.id !== goal('01')) }, seed, evidence))
        .toThrow(expect.objectContaining({ recovery: { id: 'progress-sdd-seed-unverified', variables: {} } }));
});

it('leaves an exact restatement distinct when two draft goals use the same wording', () => {
    const wording = 'Preserve test scope.';
    const issue = body.replace('User Interface', wording).replace(/^\| (G-0[12]) \|[^\n]+$/gmu, (_row, id: string) =>
        `| ${id} | ${wording} |`);
    const input = readSddSeed(issue);
    if (!input.seed) throw new Error('Fixture draft unavailable');
    const source = reconcileProgressSddScope(captureProgressScopeSource(issue), input, evidence);
    expect(source.lines).toContainEqual({ id: 'L7', quote: wording, origin: 'issue' });
    expect(source.draft?.required.size).toBe(6);
});


it('checks the permissions of both maintainers when the review and selection authors differ', async () => {
    const f = fixture();
    const original = await f.reads.comments.listIssueComments();
    const actor = 'another-maintainer';
    const selectionId = 6693404686;
    const record = { ...originalCard, answers: originalCard.answers!.map(answer =>
        answer.commentId === selectionId ? { ...answer, author: actor } : answer) };
    f.reads.comments.listIssueComments.mockResolvedValue({
        ...original, value: gateComments(record).map(comment => comment.id === selectionId ? { ...comment, user: { login: actor } } : comment),
    });
    f.reads.actors.isActorAllowedToModifyFiles.mockImplementation(async (login?: string) => login !== actor);
    gateFailure(await f.run());
    expect(f.reads.actors.isActorAllowedToModifyFiles).toHaveBeenNthCalledWith(1, 'efraespada');
    expect(f.reads.actors.isActorAllowedToModifyFiles).toHaveBeenNthCalledWith(2, actor);
    expect(f.execute).not.toHaveBeenCalled();
});


it('retains existing progress when the marked draft was removed after publication', async () => {
    const f = fixture(seed.scope, true, true);
    gateFailure(await f.run());
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.setProgressLabel).not.toHaveBeenCalled();
});


it('does not require an absent seed for a normal published SDD', () => {
    const { selection: _seed, selectionArtifact: _hash, ...generated } = originalCard;
    expect(expectsPublishedProgressSeed(gateComments(generated), 30, 'vypbot')).toBe(false);
    expect(expectsPublishedProgressSeed(gateComments({ ...originalCard, answers: undefined }), 30, 'vypbot')).toBe(false);
});
