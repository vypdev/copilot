'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ownerRepo = 'fixture/rollback';
const pr = 42;
const repositoryId = 27;
const head = 'a'.repeat(40), base = 'b'.repeat(40), merge = 'c'.repeat(40);
const authority = { mode: 'disabled', generation: 2, policyDigest: '2'.repeat(64), workflowId: 31, sourceAppId: 12 };

function fixture(kind) {
    const prefix = '/repos/' + ownerRepo;
    const policy = { version: 1, mode: 'recommend', targetRoles: ['development'], branchKinds: ['feature'],
        requireLinkedIssue: true, additionalExcludedPaths: [], testChecks: [{ name: 'Fixture CI', sourceAppId: 12, workflowName: 'CI' }],
        producerAttested: true, coverage: { mode: 'check', checkName: 'Fixture CI' }, allowHumanDismissed: false, skipWhenHumanApproved: true };
    const pull = { number: pr, state: 'open', draft: false, changed_files: 1, body: 'Closes #21', user: { id: 9 },
        mergeable: true, merge_commit_sha: merge, head: { sha: head, ref: 'feature/21-rollback', repo: { id: repositoryId } },
        base: { sha: base, ref: 'develop', repo: { id: repositoryId } } };
    const legacy = { user: { id: 10 }, body: '<!-- copilot-bugbot-status schema="1" pr="42" verified_head="' + head
        + '" digest="deadbeef" -->\n<!-- copilot-bugbot-approval-evidence schema="1" head="' + head
        + '" digest="deadbeef" outcome="complete" coverage="complete" open="0" reopened="0" dismissed="0" verification="0" unknown="0" -->' };
    const fresh = kind === 'injected-fresh';
    const receipt = { version: 1, repositoryId, pullNumber: pr, headSha: head, baseSha: base,
        policyDigest: fresh ? authority.policyDigest : '1'.repeat(64), generation: fresh ? 2 : 1,
        mode: fresh ? 'disabled' : 'enforced', runId: 82, attempt: 1, coverage: 'complete', verification: 'complete',
        publication: 'verified', outcome: 'complete',
        findingStates: { open: 0, reopened: 0, dismissed: 0, fixed: 0, obsolete: 0, verificationRequired: 0, unknown: 0 } };
    const check = { id: 101, name: 'Copilot / Review', app: { id: 12 }, head_sha: head, check_suite: { id: 51 },
        status: 'completed', conclusion: 'success', output: { summary: '<!-- copilot-bugbot-verification:v1 ' + JSON.stringify(receipt) + ' -->' } };
    const ciCheck = { id: 102, name: 'Fixture CI', app: { id: 12 }, head_sha: merge, status: 'completed', conclusion: 'success' };
    const run = { id: 82, name: 'Review', workflow_id: 31, check_suite_id: 51, head_sha: head,
        status: 'completed', conclusion: 'success', run_attempt: 1, pull_requests: [{ number: pr }] };
    const ciRun = { id: 83, name: 'CI', head_sha: merge, status: 'completed', conclusion: 'success', run_attempt: 1 };
    let pullReads = 0;
    return (url, method) => {
        assert.equal(method, 'GET', 'FORBIDDEN MUTATION');
        const resource = decodeURIComponent(url.pathname);
        const reply = (body, status = 200) => ({ body, status });
        if (resource === prefix + '/actions/variables/PR_APPROVAL_POLICY') return reply({ value: JSON.stringify(policy) });
        if (resource === prefix + '/pulls/42') {
            // Simulate a moved head on the assessment publication read. Both
            // policy decisions remain observable without a mutation request.
            return reply(++pullReads === 1 ? pull : { ...pull, head: { ...pull.head, sha: 'd'.repeat(40) } });
        }
        if (resource === prefix + '/git/ref/heads/develop') return reply({ ref: 'refs/heads/develop', object: { type: 'commit', sha: base } });
        if (resource === prefix + '/git/commits/' + merge) return reply({ parents: [{ sha: base }, { sha: head }] });
        if (resource === prefix + '/pulls/42/files') return reply([{ filename: 'src/fixture.ts' }]);
        if (resource === prefix + '/pulls/42/reviews') return reply([]);
        if (resource === prefix + '/issues/42/comments') return reply(kind === 'packaged-no-card' ? [] : [legacy]);
        if (resource === prefix + '/commits/' + head + '/check-runs') return reply({ total_count: 1, check_runs: [check] });
        if (resource === prefix + '/commits/' + merge + '/check-runs') return reply({ total_count: 1, check_runs: [ciCheck] });
        if (resource === prefix + '/actions/runs') return reply({ total_count: 1, workflow_runs: [url.searchParams.get('head_sha') === head ? run : ciRun] });
        if (resource === prefix + '/actions/runs/83/attempts/1/jobs') return reply({ total_count: 1, jobs: [{ check_run_url: 'https://api.github.com/repos/' + ownerRepo + '/check-runs/102' }] });
        if (resource === prefix + '/rules/branches/develop') return reply([{ type: 'pull_request', parameters: { dismiss_stale_reviews_on_push: true } }]);
        if (resource === prefix + '/branches/develop/protection') return reply({ message: 'Not found' }, 404);
        if (resource === '/user') return reply({ id: 10 });
        console.error('UNEXPECTED FIXTURE ROUTE', resource);
        throw new Error('Unknown fixture read');
    };
}

async function main() {
    const bundle = fs.realpathSync(process.argv[2]);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-packaged-rollback-'));
    try {
        const event = path.join(root, 'event.json');
        fs.writeFileSync(event, JSON.stringify({ action: 'completed', repository: { id: repositoryId },
            workflow_run: { head_repository: { id: repositoryId }, pull_requests: [{ number: pr }] } }));
        const expected = { 'packaged-legacy-card': 'recommend (recommend-mode)', 'packaged-no-card': 'pending (bugbot-missing)',
            'injected-stale': 'pending (bugbot-missing)', 'injected-fresh': 'recommend (recommend-mode)' };
        const results = [];
        for (const [kind, decision] of Object.entries(expected)) {
            const summary = path.join(root, kind + '.md');
            fs.writeFileSync(summary, '');
            const injected = kind.startsWith('injected');
            const invocation = injected
                ? ['-e', 'const pkg=require(process.argv[1]); void pkg.runGitHubActionEntry(() => pkg.runGitHubAction(JSON.parse(process.argv[2])));',
                    bundle, JSON.stringify(authority)]
                : [bundle];
            const respond = fixture(kind);
            const violations = [];
            const server = createServer((request, response) => {
                try {
                    const { status, body } = respond(new URL(request.url, 'http://127.0.0.1'), request.method);
                    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
                } catch {
                    violations.push(request.method);
                    response.writeHead(405).end();
                }
            });
            server.listen(0, '127.0.0.1');
            await once(server, 'listening');
            let output = '', status;
            try {
                const run = spawn(process.execPath, invocation, {
                    cwd: root, timeout: 30_000,
                    env: { PATH: process.env.PATH, GITHUB_REPOSITORY: ownerRepo, GITHUB_EVENT_NAME: 'workflow_run',
                        GITHUB_EVENT_PATH: event, GITHUB_STEP_SUMMARY: summary,
                        GITHUB_API_URL: 'http://127.0.0.1:' + server.address().port,
                        INPUT_VARS_JSON: JSON.stringify({ 'INPUT_PR-APPROVAL-OBSERVER': 'true', 'INPUT_BUGBOT-SEVERITY': 'info',
                            'INPUT_BUGBOT-VERIFICATION-MODE': 'disabled', INPUT_TOKEN: 'offline-fixture-token' }),
                        ...(injected ? { JEST_WORKER_ID: '1' } : {}) },
                });
                for (const stream of [run.stdout, run.stderr]) stream.on('data', data => { output += data; });
                [status] = await once(run, 'close');
            } finally { server.close(); }
            assert.deepEqual(violations, [], output);
            assert(output.includes('PR #42: ' + decision + '; assessment failed.'), output);
            assert.equal(status, 1, output);
            results.push({ kind, decision, assessment: 'stale-head-fence', mutationRequests: 0 });
        }
        console.log(JSON.stringify({ sha256: createHash('sha256').update(fs.readFileSync(bundle)).digest('hex'), results }, null, 2));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
