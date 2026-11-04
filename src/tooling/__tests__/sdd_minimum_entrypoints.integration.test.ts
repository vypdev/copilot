import { IssueUseCase } from '../../application/usecases/issue_use_case';
import { IssueCommentUseCase } from '../../application/usecases/issue_comment_use_case';
import { PreBranchSddGateUseCase } from '../../application/usecases/sdd/pre_branch_sdd_gate_use_case';
import { ApplicationError } from '../../application/errors/application_error';
import type { SddCatalogSnapshot } from '../../application/ports/pre_branch_sdd_ports';
import { FindingsAgentAdapter } from '../../data/repository/ai/findings_agent_adapter';
import { Ai } from '../../data/model/ai';
import { Config } from '../../data/model/config';
import { Result } from '../../data/model/result';
import type { Execution } from '../../data/model/execution';
import type { AgentSourceSnapshot } from '../../domain/agent_source_snapshot';
import { readSddGateRecord } from '../../domain/pre_branch_sdd';
import { sddConsistencyFixture } from '../../testing/sdd_consistency_fixture';

jest.mock('../../utils/logger', () => ({ logInfo: jest.fn(), logDebugInfo: jest.fn(), logError: jest.fn(), logWarn: jest.fn() }));

const baseSha = '6bd590dac62bdd075d2894e29aa580791dec81a5';
const title = 'Change payments', body = 'Update payments while preserving the registered owner.';
const answer = 'SDD Q1: Keep the existing owner and all resolved requirements.';
type Entry = 'issue' | 'issue-comment';
type Fault = 'minimum' | 'provider' | 'malformed' | 'stale';

async function fixture(fault: Fault) {
    let labels = ['feature', 'in-progress'], liveBody = body, awaiting = true;
    const comments: { id: number; body: string; user: { login: string } }[] = [];
    const owner = sddConsistencyFixture();
    const plan = { action: 'update', path: 'specs/payments.md', capabilityId: 'payments', reason: 'A reviewed change to the registered payments contract.', newCapability: null };
    const execute = jest.fn(async (request: { prompt: string; sourceSnapshot?: AgentSourceSnapshot }) => {
        if (request.sourceSnapshot?.phase === 'analysis') return JSON.stringify({ ...plan,
            questions: awaiting ? [{ id: 'Q1', text: 'Should the existing owner and requirements remain?', owner: 'issue-author', suggestion: null }] : [] });
        if (fault === 'provider') throw new ApplicationError('provider.unavailable', 'Provider unavailable.', {
            correlationId: '6f173f89-96a3-4fc8-b90e-4f8f48e0e319', cause: new Error('PRIVATE_PROVIDER_CAUSE'),
        });
        if (fault === 'stale') liveBody = 'A concurrent human edit must be retained.';
        return JSON.stringify({ markdown: fault === 'malformed' ? 42 : 'PRIVATE_REJECTED_RESPONSE' });
    });
    const snapshot: SddCatalogSnapshot = { baseSha, standard: '# Standard', template: '# Template', capabilities: [{
        id: 'payments', title: 'Payments', status: 'implemented', scope: 'Payment workflow', owner: 'Maintainers', lastVerified: '2026-11-04',
        specs: ['specs/payments.md'], workflows: [], entrypoints: ['src/main.ts'], code: ['src/payments.ts'], tests: ['test/payments.test.ts'], documentation: ['docs/payments.mdx'],
    }] };
    const publish = jest.fn(), validateDraft = jest.fn(), readSdd = jest.fn(async (_sha: string, _path: string) => owner);
    const gate = new PreBranchSddGateUseCase(new FindingsAgentAdapter({ cli: { execute } }), {
        loadSnapshot: jest.fn(async () => snapshot), readSourceRevision: jest.fn(async () => baseSha),
        readSdd, validateDraft, publish, isAncestor: jest.fn(async () => true),
        recoverPublished: jest.fn(), verifyPublication: jest.fn(),
    }, {
        listIssueComments: jest.fn(async () => comments),
        addComment: jest.fn(async (_number, text) => { comments.push({ id: Math.max(99, ...comments.map(c => c.id)) + 1, body: text, user: { login: 'bot' } }); }),
        updateComment: jest.fn(async (_number, id, text) => { const target = comments.find(c => c.id === id); if (target) target.body = text; }),
    }, { getLabels: jest.fn(async () => labels), setLabels: jest.fn(async (_number, next) => { labels = [...next]; }) }, {
        isActorAllowedToModifyFiles: jest.fn(async () => true), isActorAllowedToUseMemberOnlyAutomation: jest.fn(async () => true),
    }, { getDescription: jest.fn(async () => liveBody) }, { getTitle: jest.fn(async () => title) } as never,
    { getLinkedBranch: jest.fn() }, { run: { serverOrigin: 'https://github.example.test', owner: 'acme', repository: 'repo', runId: '123' } });
    const step = (id: string) => ({ taskId: id, invoke: jest.fn(async () => [new Result({ id, success: true, executed: false })]) });
    const prepare = { taskId: 'prepare', invoke: jest.fn(async () => { throw new Error('A failed SDD must never prepare a branch.'); }) };
    const recommend = { taskId: 'recommend', invoke: jest.fn(async () => ({ results: [] })) };
    const deploy = { taskId: 'deploy', invoke: jest.fn(async () => { throw new Error('A failed SDD must never deploy.'); }) };
    const issue = new IssueUseCase(recommend, step('help'), {
        checkPermissions: step('permissions'), closeNotAllowedIssue: step('close'), removeIssueBranches: step('remove'),
        assignMemberToIssue: step('assign'), updateIssueType: step('type'), linkIssueProject: step('project'),
        checkPriorityIssueSize: step('priority'), updateTitle: step('title'), prepareBranches: prepare,
        reconcileBranchReadiness: { taskId: 'readiness', invoke: jest.fn(async () => []) },
        removeNotNeededBranches: step('obsolete'), deployAdded: deploy,
    }, { listIssueComments: jest.fn(async () => comments) }, undefined, gate);
    const unused = { taskId: 'unused', invoke: jest.fn(async () => { throw new Error('SDD answers must use their normal continuation.'); }) };
    const comment = new IssueCommentUseCase(unused, unused, unused, unused, unused, {} as never, {} as never,
        undefined, undefined, undefined, undefined, undefined, issue);
    const execution = (entry: Entry): Execution => ({
        owner: 'acme', repo: 'repo', actor: 'alice', tokenUser: 'bot', tokens: { token: 'fixture-token' },
        eventName: entry === 'issue' ? 'issues' : 'issue_comment', inputs: { action: entry === 'issue' ? 'labeled' : 'created', issue: { state: 'open' } },
        isIssue: true, isPullRequest: false, issueNumber: 42, preBranchSdd: true, issueWorkflowKind: 'feature', issueWorkflowProfileDigest: 'profile',
        issueStartDecision: { started: true, branchRequired: true, sddRequired: true, helpRequired: false },
        cleanIssueBranches: false, managementBranch: 'feature', currentConfiguration: new Config({ branchType: 'feature' }),
        issue: { number: 42, title, body, creator: 'alice', url: 'https://github.example.test/acme/repo/issues/42',
            opened: false, labeled: entry === 'issue', labelAdded: 'in-progress', desiredAssigneesCount: 0, issueManagedBranches: true,
            commentBody: answer, commentAuthor: 'alice', commentId: 101 },
        pullRequest: { number: -1, title: '', opened: false, creator: '', desiredAssigneesCount: 0 },
        labels: { currentIssueLabels: [...labels], isFeature: true, isEnhancement: false, isRelease: false, isHotfix: false,
            isQuestion: false, isHelp: false, isMandatoryBranchedLabel: false, isBugfix: false, isBug: false, isDocs: false,
            isDocumentation: false, isChore: false, isMaintenance: false, containsBranchedLabel: false,
            priorityLabelOnIssueProcessable: false, priorityHigh: 'priority: high', priorityMedium: 'priority: medium', priorityLow: 'priority: low',
            feature: 'feature', bugfix: 'bugfix', deploy: 'deploy' },
        emoji: { emojiLabeledTitle: false, branchManagementEmoji: '' }, release: { active: false }, hotfix: { active: false },
        project: { getProjects: () => [], getProjectColumnIssueInProgress: () => 'In Progress',
            getProjectColumnIssueCreated: () => 'Todo', getProjectColumnPullRequestCreated: () => 'Review' },
        branches: { main: 'master', defaultBranch: 'master', development: 'develop', featureTree: 'feature', bugfixTree: 'bugfix', docsTree: 'docs', choreTree: 'chore', hotfixTree: 'hotfix' },
        issueTypes: Object.fromEntries(['task', 'bug', 'feature', 'documentation', 'maintenance', 'hotfix', 'release', 'question', 'help']
            .flatMap(name => [[name, name], [`${name}Description`, `${name} description`], [`${name}Color`, 'BLUE']])),
        workflows: { release: 'release.yml', hotfix: 'hotfix.yml' }, commitPrefixBuilder: '',
        locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' }, ai: new Ai('', 'model', false, [], false, 'low', 20),
    } as unknown as Execution);
    await issue.invoke(execution('issue'));
    const card = comments.find(c => readSddGateRecord(c.body, 42));
    expect(card).toBeDefined(); expect(execute).toHaveBeenCalledTimes(1);
    comments.push({ id: Math.max(...comments.map(c => c.id)) + 1, body: answer, user: { login: 'alice' } });
    awaiting = false;
    return { comments, card: card!, execute, publish, validateDraft, readSdd, owner, labels: () => labels,
        prepare, recommend, deploy, invoke: (entry: Entry) => entry === 'issue' ? issue.invoke(execution(entry)) : comment.invoke(execution(entry)) };
}

describe.each(['issue', 'issue-comment'] as const)('undersized SDD through ordinary %s entrypoint', entry => {
    it.each(['minimum', 'provider', 'malformed', 'stale'] as const)('preserves owner/answers and publication fences for %s', async fault => {
        const f = await fixture(fault);
        const results = await f.invoke(entry);
        const errors = results.flatMap(r => [...r.errors]);
        expect(errors.some(e => e.code === (fault === 'provider' ? 'provider.unavailable' : fault === 'malformed' ? 'workflow.failed' : 'validation.invalid-input'))).toBe(true);
        const draftCalls = () => f.execute.mock.calls.filter(([request]) => request.sourceSnapshot?.phase === 'draft');
        expect(draftCalls()).toHaveLength(1);
        expect(f.execute.mock.calls.every(([request]) => request.sourceSnapshot?.baseSha === baseSha)).toBe(true);
        expect(f.execute.mock.calls.some(([request]) => request.prompt.includes('Keep the existing owner and all resolved requirements.'))).toBe(true);
        expect(readSddGateRecord(f.card.body, 42)).toMatchObject({ plan: { path: 'specs/payments.md', capabilityId: 'payments' }, baseSha });
        expect(f.comments.some(c => c.user.login === 'alice' && c.body === answer)).toBe(true);
        expect(f.readSdd.mock.calls.every(call => call.length >= 2 && call[0] === baseSha && call[1] === 'specs/payments.md')).toBe(true);
        const status = () => f.comments.filter(c => c.body.includes('copilot:sdd-analysis-status:v1'));
        if (fault === 'stale') expect(status()).toHaveLength(0);
        else {
            expect(status()).toHaveLength(1);
            if (fault === 'minimum') {
                expect(errors.find(e => e.recovery?.id === 'sdd-draft-response-too-short')?.recovery).toMatchObject({ variables: { minimum: 1800, observed: 'unavailable', attempts: 1 } });
                expect(status()[0].body).toContain('response-minimum'); expect(status()[0].body).toContain('1800');
                const statusId = status()[0].id;
                await f.invoke(entry);
                expect(status()).toHaveLength(1); expect(status()[0].id).toBe(statusId); expect(draftCalls()).toHaveLength(2);
            } else expect(status()[0].body).not.toContain('sdd-draft-response-too-short');
        }
        expect(f.prepare.invoke).not.toHaveBeenCalled(); expect(f.publish).not.toHaveBeenCalled(); expect(f.validateDraft).not.toHaveBeenCalled();
        expect(f.recommend.invoke).not.toHaveBeenCalled(); expect(f.deploy.invoke).not.toHaveBeenCalled(); expect(f.labels()).not.toContain('branched');
        expect(JSON.stringify(f.comments) + JSON.stringify(results)).not.toMatch(/PRIVATE_REJECTED_RESPONSE|PRIVATE_PROVIDER_CAUSE|fixture-token/);
    });
});
