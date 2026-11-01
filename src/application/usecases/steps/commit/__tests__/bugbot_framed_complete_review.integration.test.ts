import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { BugbotGitReviewSourceAdapter } from '../../../../../infrastructure/filesystem/bugbot_git_review_source_adapter';
import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../../../domain/bugbot/review_configuration';
import type { BugbotPullRequestIdentity } from '../../../../../domain/bugbot/context';
import type { BugbotScmPorts } from '../../../../ports/bugbot_scm_ports';
import type { FindingsQueryRequest } from '../../../../ports/agent_findings_ports';
import type { PullRequestReviewChange } from '../../../../ports/bugbot_pull_request_read_ports';
import type { BugbotReviewOperationContext } from '../bugbot/bugbot_review_operation_context';
import { runDetectPotentialProblemsWorkflow } from '../detect_potential_problems_workflow';

let root: string, base: string, head: string;
const filenames = Array.from({ length: 887 }, (_, index) => `src/file-${index}.ts`);
let changes: PullRequestReviewChange[];
function git(...args: string[]): string {
    return execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0',
        '-c', `core.hooksPath=${join(root, '.git', 'no-hooks')}`, ...args], {
        encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
    }).trim();
}
beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'copilot-framed-complete-'));
    git('init', '-q', '--object-format=sha1'); git('commit', '--allow-empty', '-qm', 'base'); base = git('rev-parse', 'HEAD');
    mkdirSync(join(root, 'src'));
    changes = filenames.map((filename, index) => {
        const text = `// source ${index}\n// ${'x'.repeat(6000)}\nexport function read() { return JSON.parse('invalid'); }\n`;
        writeFileSync(join(root, filename), text);
        return { filename, status: 'added', additions: 3, deletions: 0,
            patch: index < 3 ? '' : '@@ -0,0 +1,3 @@\n' + text.trimEnd().split('\n').map(line => '+' + line).join('\n') + '\n' };
    });
    git('add', '--all'); git('commit', '-qm', 'complete coherent source'); head = git('rev-parse', 'HEAD');
}, 120000);
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

function fixture(mode: 'publish' | 'dry-run' = 'publish', fault?: 'receipt' | 'inventory') {
    const identity: BugbotPullRequestIdentity = { number: 7, state: 'open', draft: false,
        baseRepository: { owner: 'owner', name: 'repo', id: 42 }, baseSha: base, baseRefSha: base, baseRef: 'develop',
        headRepositoryOwner: 'owner', headRepositoryName: 'repo', headRef: 'feature/review', headSha: head, changedFileCount: 887 };
    const operation: BugbotReviewOperationContext = { repository: { owner: 'owner', name: 'repo', id: 42 },
        target: { issueNumber: 7, isPullRequest: true, pullRequestNumber: 7, headBranch: 'feature/review', commitBranch: 'feature/review',
            baseBranch: 'develop', pullRequestAction: 'opened', draft: false },
        trigger: { kind: 'pull_request', headOwner: 'owner', expectedHeadSha: head }, trustedAuthorLogin: 'bot',
        ignorePatterns: [], organizationRules: [], locale: { issue: 'en-US', pullRequest: 'en-US' },
        analysis: { agentConfiguration: { provider: 'codex', model: 'fixture' }, minimumSeverity: 'low', commentLimit: 20,
            reviewConfiguration: { ...DEFAULT_BUGBOT_REVIEW_CONFIGURATION, publicationMode: mode } } };
    const bounded = (source: string, value: unknown, count = 0) => ({ value, coverage: { source, status: 'complete',
        pagesFetched: source === 'diff' ? 9 : 1, itemsFetched: count, itemsRetained: count,
        omittedItems: 0, truncatedItems: 0, limitReached: false } });
    const comments: any[] = [], reviews: any[] = [], status: any[] = [], mutations: string[] = [];
    let calls = 0, firstMutationAfterCalls = 0;
    const mutate = (kind: string) => { firstMutationAfterCalls ||= calls; mutations.push(kind); };
    const scm: BugbotScmPorts = {
        reviewSource: new BugbotGitReviewSourceAdapter(root),
        context: {
            getPullRequest: async () => identity, getSourceBoundPullRequest: async () => identity,
            findOpenPullRequestsByExactHead: async () => [],
            listIssueComments: async () => bounded('issue-comments', status) as any,
            listPullRequestReviewComments: async () => bounded('pull-request-comments', comments) as any,
            listPullRequestReviewThreadStates: async () => bounded('review-threads', {}) as any,
            getReviewDiffSnapshot: async () => bounded('diff', { changes: fault === 'inventory' ? changes.slice(0, -1) : changes,
                filesWithFirstDiffLine: [], filesWithDiffLocations: [] }, 887) as any,
            getPullRequestHeadSha: async () => head, getPullRequestReviewCommentBody: async () => null, loadRules: async () => [],
        },
        publication: { issueComments: { updateComment: async (_number, _id, body) => { mutate('issue-update'); if (status[0]) status[0].body = body; }, addComment: async (_number, body) => { mutate('issue'); status.push({ id: 99, body, user: { login: 'bot' } }); } },
            pullRequestComments: {
                createReviewWithComments: async (_number, sha, body, drafts) => {
                    mutate('review'); reviews.push({ identity: '1000', body, authorLogin: 'bot', commitId: sha, url: 'https://github.com/owner/repo/pull/7#pullrequestreview-1000' });
                    for (const [index, draft] of drafts.entries()) comments.push({ id: index + 1, identity: `PRRC_${index + 1}`, parentReviewIdentity: '1000', authorLogin: 'bot', body: draft.body, path: draft.path, line: draft.line });
                    return { identity: '1000' };
                }, updatePullRequestReviewComment: async () => { mutate('inline-update'); }, unresolvePullRequestReviewThread: async () => { mutate('unresolve'); },
            } },
        resolution: { issueComments: { updateComment: async () => { mutate('issue-update'); } },
            pullRequestComments: { listPullRequestReviewComments: async () => comments, updatePullRequestReviewComment: async () => { mutate('inline-update'); },
                resolvePullRequestReviewThread: async () => { mutate('resolve'); }, unresolvePullRequestReviewThread: async () => { mutate('unresolve'); } } },
        reconciliation: { snapshot: { listIssueComments: async () => status, listPullRequestReviewComments: async () => comments,
            listPullRequestReviewThreadStates: async () => Object.fromEntries(comments.map(comment => [comment.identity, { resolved: false }])),
            listPullRequestReviews: async () => reviews, getPullRequestHeadSha: async () => head,
            navigationForPullRequest: () => ({ pullRequestUrl: 'https://github.com/owner/repo/pull/7', commitUrl: `https://github.com/owner/repo/commit/${head}` }) },
        presentation: { comments: { addComment: async (_number, body) => { mutate('summary'); status.push({ id: 99, body, user: { login: 'bot' } }); },
            updateComment: async (_number, _id, body) => { mutate('summary-update'); if (status[0]) status[0].body = body; } },
            updatePullRequestReview: async (_number, _id, body) => { mutate('review-update'); reviews[0].body = body; } } },
    };
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        calls++; const p = (request.options!.schema as any).properties;
        const last = p.reviewed_fragment_ids.items.enum.some((id: string) => id.startsWith('fragment-887-'));
        const response = { outputLocale: 'en-US', partition_id: p.partition_id.enum[0], reviewed_head_sha: p.reviewed_head_sha.enum[0],
            reviewed_base_sha: p.reviewed_base_sha.enum[0], review_manifest_digest: p.review_manifest_digest.enum[0],
            review_frame_id: fault === 'receipt' && last ? 'foreign-frame' : p.review_frame_id.enum[0],
            review_coverage_digest: p.review_coverage_digest.enum[0], reviewed_fragment_ids: p.reviewed_fragment_ids.items.enum,
            findings: last ? [{ id: 'late-defect', title: 'Late-frame defect', description: 'Parsing this invalid JSON literal always throws.',
                file: filenames[886], line: 3, endLine: 3, severity: 'high', confidence: 0.99, category: 'correctness',
                evidence: 'The literal is invalid JSON.', suggestion: 'Use validated JSON input.', symbol: 'read', codeSnippet: "JSON.parse('invalid')", suggestedCode: null }] : [],
            resolved_findings: [] };
        return response;
    });
    return { operation, scm, query, mutations, reviews, status, get firstMutationAfterCalls() { return firstMutationAfterCalls; } };
}

it('bugbot-framed-C123 reviews887 real immutable files and publishes the final-frame finding only after full coverage', async () => {
    const f = fixture(); const before = git('status', '--porcelain');
    const results = await runDetectPotentialProblemsWorkflow(f.operation, { aiRepository: { query: f.query }, scm: f.scm });
    expect(results[0].success).toBe(true);
    expect(f.query.mock.calls.length).toBeGreaterThan(64);
    expect(f.firstMutationAfterCalls).toBe(f.query.mock.calls.length);
    expect(f.reviews).toHaveLength(1);
    expect(f.mutations.filter(x => x === 'review')).toHaveLength(1);
    expect(f.reviews[0].body).toContain('Bugbot'); expect(f.mutations).not.toContain('resolve');
    expect(git('status', '--porcelain')).toBe(before);
}, 120000);
it('bugbot-framed-C125 rejects a late foreign receipt without any finding, resolution or summary mutation', async () => {
    const f = fixture('publish', 'receipt');
    const results = await runDetectPotentialProblemsWorkflow(f.operation, { aiRepository: { query: f.query }, scm: f.scm });
    expect(results[0].success).toBe(false); expect(f.query.mock.calls.length).toBeGreaterThan(64);
    expect(f.mutations).toEqual([]); expect(f.reviews).toEqual([]);
    expect(results[0].errors?.[0]).toMatchObject({ retryable: false, recovery: { id: 'bugbot-review-incomplete' } });
}, 120000);
it('does not call any reviewer when the fresh native snapshot omits a required final file', async () => {
    const f = fixture('publish', 'inventory');
    const results = await runDetectPotentialProblemsWorkflow(f.operation, { aiRepository: { query: f.query }, scm: f.scm });
    expect(results[0].success).toBe(false); expect(f.query).not.toHaveBeenCalled(); expect(f.mutations).toEqual([]);
}, 120000);
it('verifies all real source and frames in dry-run without any SCM mutation', async () => {
    const f = fixture('dry-run');
    const results = await runDetectPotentialProblemsWorkflow(f.operation, { aiRepository: { query: f.query }, scm: f.scm });
    expect(results[0].success).toBe(true); expect(f.query.mock.calls.length).toBeGreaterThan(64); expect(f.mutations).toEqual([]);
}, 120000);
it('rejects an altered final blob before reviewer execution, independently of native patch counters', async () => {
    const file = filenames[886], oid = git('rev-parse', `HEAD:${file}`);
    const object = join(root, '.git', 'objects', oid.slice(0, 2), oid.slice(2));
    const original = readFileSync(object), contents = readFileSync(join(root, file));
    const altered = Buffer.from(contents); altered[0] = 35;
    chmodSync(object, 0o600); writeFileSync(object, deflateSync(Buffer.concat([Buffer.from(`blob ${altered.length}\0`), altered])));
    try {
        const f = fixture();
        const results = await runDetectPotentialProblemsWorkflow(f.operation, { aiRepository: { query: f.query }, scm: f.scm });
        expect(results[0].success).toBe(false); expect(f.query).not.toHaveBeenCalled(); expect(f.mutations).toEqual([]);
    } finally { writeFileSync(object, original); chmodSync(object, 0o444); }
}, 120000);

it.each([2, 6])('rejects a changed live base at source-identity read %s without publishing a result', async changedRead => {
    const f = fixture(); let reads = 0;
    const original = f.scm.context.getSourceBoundPullRequest!;
    f.scm.context.getSourceBoundPullRequest = async number => {
        const current = await original(number);
        return ++reads === changedRead ? { ...current, baseRefSha: 'f'.repeat(40) } : current;
    };
    const results = await runDetectPotentialProblemsWorkflow(f.operation, { aiRepository: { query: f.query }, scm: f.scm });
    expect(f.mutations).toEqual([]);
    expect((results[0].payload as any).bugbotTelemetry.outcome).not.toBe('completed');
    if (changedRead === 2) expect(f.query).not.toHaveBeenCalled();
    else expect(f.query.mock.calls.length).toBeGreaterThan(64);
}, 120000);
