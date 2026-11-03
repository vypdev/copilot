import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BugbotGitReviewSourceAdapter } from '../../../infrastructure/filesystem/bugbot_git_review_source_adapter';
import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../domain/bugbot/review_configuration';
import type { BugbotPullRequestIdentity } from '../../../domain/bugbot/context';
import type { BugbotScmPorts } from '../../../application/ports/bugbot_scm_ports';
import type { FindingsQueryRequest } from '../../../application/ports/agent_findings_ports';
import type { PullRequestReviewChange } from '../../../application/ports/bugbot_pull_request_read_ports';
import type { BugbotReviewOperationContext } from '../../../application/usecases/steps/commit/bugbot/bugbot_review_operation_context';
import { runDetectPotentialProblemsWorkflow } from '../../../application/usecases/steps/commit/detect_potential_problems_workflow';

let root: string, base: string, head: string;
const filenames = Array.from({ length: 3 }, (_, index) => `src/file-${index}.ts`);
let changes: PullRequestReviewChange[];
export function git(...args: string[]): string {
    return execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0',
        '-c', `core.hooksPath=${join(root, '.git', 'no-hooks')}`, ...args], {
        encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
    }).trim();
}
beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'copilot-long-conversation-'));
    git('init', '-q', '--object-format=sha1'); git('commit', '--allow-empty', '-qm', 'base'); base = git('rev-parse', 'HEAD');
    mkdirSync(join(root, 'src'));
    changes = filenames.map((filename, index) => {
        const text = `// source ${index}\n// ${'x'.repeat(29900)}\nexport function read() { return JSON.parse('invalid'); }\n`;
        writeFileSync(join(root, filename), text);
        return { filename, status: 'added', additions: 3, deletions: 0,
            patch: '@@ -0,0 +1,3 @@\n' + text.trimEnd().split('\n').map(line => '+' + line).join('\n') + '\n' };
    });
    git('add', '--all'); git('commit', '-qm', 'complete coherent source'); head = git('rev-parse', 'HEAD');
}, 120000);
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

export function fixture(discussion: any[], mode: 'publish' | 'dry-run' = 'publish') {
    const identity: BugbotPullRequestIdentity = { number: 7, state: 'open', draft: false,
        baseRepository: { owner: 'owner', name: 'repo', id: 42 }, baseSha: base, baseRefSha: base, baseRef: 'develop',
        headRepositoryOwner: 'owner', headRepositoryName: 'repo', headRef: 'feature/review', headSha: head, changedFileCount: 3 };
    const operation: BugbotReviewOperationContext = { repository: { owner: 'owner', name: 'repo', id: 42 },
        target: { issueNumber: 7, isPullRequest: true, pullRequestNumber: 7, headBranch: 'feature/review', commitBranch: 'feature/review',
            baseBranch: 'develop', pullRequestAction: 'opened', draft: false },
        trigger: { kind: 'pull_request', headOwner: 'owner', expectedHeadSha: head }, trustedAuthorLogin: 'bot',
        ignorePatterns: [], organizationRules: [], locale: { issue: 'en-US', pullRequest: 'en-US' },
        analysis: { agentConfiguration: { provider: 'codex', model: 'fixture' }, minimumSeverity: 'low', commentLimit: 20,
            reviewConfiguration: { ...DEFAULT_BUGBOT_REVIEW_CONFIGURATION, publicationMode: mode } } };
    const bounded = (source: string, value: unknown, count = 0) => ({ value, coverage: { source, status: 'complete',
        pagesFetched: 1, itemsFetched: count, itemsRetained: count,
        omittedItems: 0, truncatedItems: 0, limitReached: false } });
    const comments: any[] = [], reviews: any[] = [], status: any[] = [], mutations: string[] = [];
    let calls = 0, firstMutationAfterCalls = 0;
    const mutate = (kind: string) => { firstMutationAfterCalls ||= calls; mutations.push(kind); };
    const scm: BugbotScmPorts = {
        reviewSource: new BugbotGitReviewSourceAdapter(root),
        context: {
            getPullRequest: async () => identity, getSourceBoundPullRequest: async () => identity,
            findOpenPullRequestsByExactHead: async () => [],
            listIssueComments: async () => bounded('issue-comments', [...discussion, ...status], discussion.length) as any,
            listPullRequestReviewComments: async () => bounded('pull-request-comments', comments) as any,
            listPullRequestReviewThreadStates: async () => bounded('review-threads', {}) as any,
            getReviewDiffSnapshot: async () => bounded('diff', { changes,
                filesWithFirstDiffLine: [], filesWithDiffLocations: [] }, 3) as any,
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
    const query = jest.fn(async (request: FindingsQueryRequest): Promise<Record<string, unknown>> => {
        calls++; const p = (request.options!.schema as any).properties;
        const response = { outputLocale: 'en-US', partition_id: p.partition_id.enum[0], reviewed_head_sha: p.reviewed_head_sha.enum[0],
            reviewed_base_sha: p.reviewed_base_sha.enum[0], review_manifest_digest: p.review_manifest_digest.enum[0],
            review_frame_id: p.review_frame_id.enum[0],
            review_coverage_digest: p.review_coverage_digest.enum[0], reviewed_fragment_ids: p.reviewed_fragment_ids.items.enum,
            findings: [],
            resolved_findings: [] };
        return response;
    });
    return { operation, scm, query, mutations, reviews, status, run: () => runDetectPotentialProblemsWorkflow(operation, { aiRepository: { query }, scm }), get firstMutationAfterCalls() { return firstMutationAfterCalls; } };
}


export function clarifications(lengths: number[]) {
    return lengths.map((length, index) => ({ id: 100 + index, body: (`SOURCE_${index}_BEGIN\n`).padEnd(length - (`\nSOURCE_${index}_END`).length, "x") + `\nSOURCE_${index}_END`, user: { login: "maintainer" }, createdAt: new Date(index * 1000).toISOString() }));
}
