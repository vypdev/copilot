'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ownerRepo = 'fixture/producer-trust';
const pr = 42;
const repositoryId = 27;
const head = 'a'.repeat(40), base = 'b'.repeat(40), merge = 'c'.repeat(40);
const authority = { mode: 'disabled', generation: 2, policyDigest: '2'.repeat(64), workflowId: 31, sourceAppId: 12 };

function receiptZip(value) {
    const name = Buffer.from('copilot-bugbot-verification.json');
    const data = Buffer.from(JSON.stringify(value));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12);
    end.writeUInt32LE(local.length + name.length + data.length, 16);
    return Buffer.concat([local, name, data, central, name, end]);
}

function fixture(scenario) {
    const prefix = '/repos/' + ownerRepo;
    const policy = { version: 1, mode: 'guarded', targetRoles: ['development'], branchKinds: ['feature'],
        requireLinkedIssue: true, additionalExcludedPaths: [], testChecks: [{ name: 'Fixture CI', sourceAppId: 12, workflowName: 'CI' }],
        producerAttested: true, coverage: { mode: 'check', checkName: 'Fixture CI' }, allowHumanDismissed: false, skipWhenHumanApproved: true };
    const pull = { number: pr, state: 'open', draft: false, changed_files: 1, body: 'Closes #21', user: { id: 9 },
        mergeable: true, merge_commit_sha: merge, head: { sha: head, ref: 'feature/21-rollback', repo: { id: repositoryId } },
        base: { sha: base, ref: 'develop', repo: { id: repositoryId } } };
    const fresh = true;
    const receipt = { version: 1, repositoryId, pullNumber: pr, headSha: head, baseSha: base,
        policyDigest: fresh ? authority.policyDigest : '1'.repeat(64), generation: fresh ? 2 : 1,
        mode: authority.mode, runId: 82, attempt: 1, coverage: 'complete', verification: 'complete',
        publication: 'verified', outcome: 'complete',
        findingStates: { open: 0, reopened: 0, dismissed: 0, fixed: 0, obsolete: 0, verificationRequired: 0, unknown: 0 } };
    Object.assign(receipt, scenario.receipt);
    const check = { id: 101, name: 'Copilot / Review', app: { id: 12 }, head_sha: head, check_suite: { id: 151 },
        status: 'completed', conclusion: 'success', output: { summary: '<!-- copilot-bugbot-verification:v1 ' + JSON.stringify(receipt) + ' -->' } };
    if (scenario.foreignApp) check.app.id = 13;
    const ciCheck = { id: 102, name: 'Fixture CI', app: { id: 12 }, head_sha: merge, status: 'completed', conclusion: 'success' };
    const run = { id: 82, name: 'Review', workflow_id: 31, check_suite_id: 51, head_sha: head,
        status: 'completed', conclusion: 'success', run_attempt: 1, pull_requests: [{ number: pr }] };
    const ciRun = { id: 83, name: 'CI', head_sha: merge, status: 'completed', conclusion: 'success', run_attempt: 1 };
    const state = { pullHeads: [], mutations: [], comments: [], reviews: scenario.human ? [{
        id: 300, user: { id: 11 }, state: scenario.human, commit_id: head, submitted_at: '2026-11-19T10:00:00Z',
    }] : [] };
    return { state, respond(url, method, body) {
        const resource = decodeURIComponent(url.pathname);
        const reply = (body, status = 200) => ({ body, status });
        if (method !== 'GET') {
            state.mutations.push({ method, resource, body });
            if (method === 'POST' && resource === prefix + '/pulls/42/reviews') {
                assert.equal(body.event, 'APPROVE'); assert.equal(body.commit_id, head);
                const review = { id: 301, user: { id: 10 }, state: 'APPROVED', commit_id: head, submitted_at: '2026-11-19T11:00:00Z' };
                state.reviews.push(review); return reply(review, 201);
            }
            if (method === 'POST' && resource === prefix + '/issues/42/comments') {
                const comment = { id: 501, user: { id: 10 }, body: body.body };
                state.comments.push(comment); return reply(comment, 201);
            }
            throw new Error('Unexpected mutation');
        }
        if (resource === prefix + '/actions/variables/PR_APPROVAL_POLICY') return reply({ value: JSON.stringify(policy) });
        if (resource === prefix + '/pulls/42') {
            state.pullHeads.push(pull.head.sha); return reply(pull);
        }
        if (resource === prefix + '/git/ref/heads/develop') return reply({ ref: 'refs/heads/develop', object: { type: 'commit', sha: base } });
        if (resource === prefix + '/git/commits/' + merge) return reply({ parents: [{ sha: base }, { sha: head }] });
        if (resource === prefix + '/pulls/42/files') return reply([{ filename: scenario.path ?? 'src/fixture.ts' }]);
        if (resource === prefix + '/pulls/42/reviews') return reply(state.reviews);
        if (resource === prefix + '/issues/42/comments') return reply(state.comments);
        if (resource === prefix + '/commits/' + head + '/check-runs') return reply({ total_count: 1, check_runs: [check] });
        if (resource === prefix + '/commits/' + merge + '/check-runs') return reply({ total_count: 1, check_runs: [ciCheck] });
        if (resource === prefix + '/actions/runs') return reply({ total_count: 1, workflow_runs: [url.searchParams.get('head_sha') === head ? run : ciRun] });
        if (resource === prefix + '/actions/runs/82/artifacts') return reply({ total_count: 1,
            artifacts: [{ id: 700, name: 'copilot-bugbot-verification-v1-82-1',
                expired: false, size_in_bytes: 2000, workflow_run: { id: scenario.foreignArtifactRun ? 99 : 82, repository_id: repositoryId,
                    head_repository_id: repositoryId, head_sha: head } }] });
        if (resource === prefix + '/actions/artifacts/700/zip') return reply(receiptZip({
            version: 1, runId: 82, attempt: 1,
            checkRunId: check.id, receipt: check.output.summary,
        }));
        if (resource === prefix + '/actions/runs/83/attempts/1/jobs') return reply({ total_count: 1, jobs: [{ check_run_url: 'https://api.github.com/repos/' + ownerRepo + '/check-runs/102' }] });
        if (resource === prefix + '/rules/branches/develop') return reply([{ type: 'pull_request', parameters: { dismiss_stale_reviews_on_push: true } }]);
        if (resource === prefix + '/branches/develop/protection') return reply({ message: 'Not found' }, 404);
        if (resource === '/user') return reply({ id: 10 });
        console.error('UNEXPECTED FIXTURE ROUTE', resource);
        throw new Error('Unknown fixture read');
    } };
}

const cases = [
    { id: 'protected-bundle', path: 'build/github_action/index.js', decision: 'recommend (protected-path)' },
    { id: 'protected-workflow', path: '.github/workflows/copilot_pull_request.yml', decision: 'recommend (protected-path)' },
    { id: 'protected-action', path: 'action.yml', decision: 'recommend (protected-path)' },
    { id: 'foreign-receipt-run', receipt: { runId: 99 }, decision: 'pending (bugbot-missing)' },
    { id: 'foreign-artifact-run', foreignArtifactRun: true, decision: 'blocked (evidence-unavailable)', exit: 1 },
    { id: 'foreign-sha', receipt: { headSha: 'd'.repeat(40) }, decision: 'pending (bugbot-missing)' },
    { id: 'foreign-app', foreignApp: true, decision: 'pending (bugbot-missing)' },
    { id: 'prior-policy', receipt: { policyDigest: '1'.repeat(64), generation: 1 }, decision: 'pending (bugbot-missing)' },
    { id: 'prior-attempt', receipt: { attempt: 2 }, decision: 'pending (bugbot-missing)' },
    { id: 'authorized-current', decision: 'already-approved (approved)', approvals: 1 },
    { id: 'rollback-stale-same-sha', receipt: { mode: 'enforced', policyDigest: '1'.repeat(64), generation: 1 }, decision: 'pending (bugbot-missing)' },
    { id: 'rollback-fresh-same-sha', decision: 'already-approved (approved)', approvals: 1 },
    { id: 'human-approved', human: 'APPROVED', decision: 'recommend (human-approved)' },
    { id: 'human-changes-requested', human: 'CHANGES_REQUESTED', decision: 'blocked (changes-requested)' },
];

async function main() {
    const bundle = fs.realpathSync(process.argv[2]);
    const output = path.resolve(process.argv[3]);
    fs.writeFileSync(output, '', { flag: 'wx' });
    const record = row => fs.appendFileSync(output, JSON.stringify(row) + '\n');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-packaged-producer-trust-'));
    record({ event: 'start', at: new Date().toISOString(), node: process.version, platform: process.platform,
        architecture: process.arch, sourceBaseline: 'ccefb27627cd627ccdb7d5666fd174c2ac1da07b',
        bundleSha256: createHash('sha256').update(fs.readFileSync(bundle)).digest('hex'),
        driverSha256: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
        authority, fixturePolicy: 'guarded', realGitHubWriteAttempts: 0, qualificationModelCalls: 0 });
    try {
        const event = path.join(root, 'event.json');
        fs.writeFileSync(event, JSON.stringify({ action: 'completed', repository: { id: repositoryId },
            workflow_run: { head_repository: { id: repositoryId }, pull_requests: [{ number: pr }] } }));
        for (const scenario of cases) {
            const fixtureCase = fixture(scenario), violations = [];
            const summary = path.join(root, scenario.id + '.md');
            fs.writeFileSync(summary, '');
            const server = createServer(async (request, response) => {
                try {
                    const parts = []; for await (const part of request) parts.push(part);
                    const text = Buffer.concat(parts).toString('utf8');
                    const body = text ? JSON.parse(text) : undefined;
                    const { body: result, status } = fixtureCase.respond(new URL(request.url, 'http://127.0.0.1'), request.method, body);
                    response.writeHead(status, { 'content-type': Buffer.isBuffer(result) ? 'application/zip' : 'application/json' })
                        .end(Buffer.isBuffer(result) ? result : JSON.stringify(result));
                } catch (error) {
                    violations.push({ method: request.method, url: request.url, message: error.message });
                    response.writeHead(405).end();
                }
            });
            server.listen(0, '127.0.0.1');
            await once(server, 'listening');
            let stdout = '', status;
            try {
                const run = spawn(process.execPath, ['-e',
                    'const p=require(process.argv[1]);void p.runGitHubActionEntry(()=>p.runGitHubAction(JSON.parse(process.argv[2])));',
                    bundle, JSON.stringify(authority)], {
                    cwd: root, timeout: 30_000,
                    env: { PATH: process.env.PATH, JEST_WORKER_ID: '1', GITHUB_REPOSITORY: ownerRepo,
                        GITHUB_EVENT_NAME: 'workflow_run', GITHUB_EVENT_PATH: event, GITHUB_STEP_SUMMARY: summary,
                        GITHUB_API_URL: 'http://127.0.0.1:' + server.address().port,
                        INPUT_VARS_JSON: JSON.stringify({ 'INPUT_PR-APPROVAL-OBSERVER': 'true', 'INPUT_BUGBOT-SEVERITY': 'info',
                            'INPUT_BUGBOT-VERIFICATION-MODE': 'disabled', INPUT_TOKEN: 'offline-fixture-token' }) },
                });
                for (const stream of [run.stdout, run.stderr]) stream.on('data', data => { stdout += data; });
                [status] = await once(run, 'close');
            } finally { server.close(); }
            const approvals = fixtureCase.state.mutations.filter(row => row.resource.endsWith('/reviews')).length;
            const observed = /PR #42: ([a-z-]+ \([a-z-]+\)); assessment ([a-z-]+)\./u.exec(stdout);
            const result = { event: 'case', id: scenario.id, expected: scenario.decision, decision: observed?.[1],
                publication: observed?.[2], status, fakeApprovalWriteAttempts: approvals,
                fakeMutations: fixtureCase.state.mutations, pullReads: fixtureCase.state.pullHeads.length,
                currentHeadOnEveryRead: fixtureCase.state.pullHeads.every(value => value === head),
                violations, stdout, realGitHubWriteAttempts: 0, evaluatedPrWriteAttempts: 0, qualificationModelCalls: 0 };
            record(result);
            assert.deepEqual(violations, [], stdout);
            assert.equal(result.decision, scenario.decision, stdout);
            assert.equal(approvals, scenario.approvals ?? 0, stdout);
            assert.equal(status, scenario.exit ?? 0, stdout);
            assert.equal(result.currentHeadOnEveryRead, true);
            assert(fixtureCase.state.pullHeads.length >= 2, 'no stale-head fence is used to stop these decisions');
        }
        record({ event: 'finish', passed: cases.length, cases: cases.length,
            actualProductionModeChanged: false, realGitHubWriteAttempts: 0, qualificationModelCalls: 0 });
        console.log(JSON.stringify({ passed: cases.length, output }));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
