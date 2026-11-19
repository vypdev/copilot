'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { readFileSync, writeFileSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

if (process.argv.length !== 4) throw new Error('Expected a packaged GitHub Action and an existing output directory.');
const bundle = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
assert.equal(readdirSync(output).length, 0, 'new empty output directory required');
const manifest = require('./manifest.json');
assert.equal(createHash('sha256').update(readFileSync(bundle)).digest('hex'), manifest.source.actionBundleSha256, 'reviewed source bundle differs');
const project = '/repos/owner/project';
const site = 'https://github.com/owner/project';
const reviewPath = '.github/workflows/copilot_pull_request.yml';
const cardPath = '.github/workflows/copilot_bugbot_status_card.yml';
const source = { repositoryId: 19, pullNumber: 11, base: 'a'.repeat(40), baseRef: 'b'.repeat(40),
    head: 'c'.repeat(40), policy: 'default' };
const revision = sha => [
    '<!-- copilot:publication schema="1" topic="bugbot" target="pr:11" key="aggregate" source="head:' + sha + '" digest="123456ab" -->',
    '<!-- copilot-bugbot-status schema="1" pr="11" verified_head="' + sha + '" digest="123456ab" -->',
    '## Bugbot status', '', 'Verified source from controlled fixture.',
].join('\n');
const previous = revision('d'.repeat(40));
const current = revision(source.head);
const result = { realGitHubWriteAttempts: 0, modelCalls: 0, installed: false, nativeCanary: false, sourceCommit: manifest.source.commit, packageSha256: createHash('sha256').update(readFileSync(bundle)).digest('hex'),
    evidence: 'packaged action with synthetic actions and comments on a loopback-only GitHub API', outcomes: [] };
const canonical = { databaseId: 55, author: { login: 'fixture-bot', __typename: 'User' }, body: previous };
let state;

function makeState(overrides = {}) {
    const pull = { number: 11, base: { sha: source.base, repo: { id: 19 } }, head: { sha: source.head, repo: { id: 19 } } };
    const run = { id: 23, run_attempt: 1, path: reviewPath, event: 'pull_request', status: 'in_progress',
        created_at: '2026-11-18T06:00:00Z', repository: { id: 19 }, head_repository: { id: 19 }, pull_requests: [pull] };
    return { comment: { ...canonical }, sourceHead: source.head, run, sequence: 4, partitions: 18, operations: [], ...overrides };
}

function check(s) {
    const externalId = ['bugbot', 11, source.base, source.head, 'default', 23, s.run.run_attempt].join(':');
    const observation = { stage: 'analyzing', headSha: source.head, baseSha: source.base, baseRefSha: source.baseRef,
        pullNumber: 11, elapsedMs: 240000, observedAt: '2026-11-18T06:04:00.000Z', sequence: s.sequence,
        partitions: { completed: s.partitions, total: 50 } };
    const marker = Buffer.from(JSON.stringify({ externalId, observation })).toString('base64url');
    return { total_count: 1, check_runs: [{ id: 38, name: 'Copilot / Review', head_sha: source.head,
        external_id: externalId, details_url: site + '/runs/38', status: 'in_progress', app: { slug: 'github-actions' },
        output: { summary: '<!-- copilot-bugbot-progress:v1 ' + marker + ' -->' } }] };
}

const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const method = request.method;
    let graphql;
    if (method === 'POST' && path === '/graphql') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        try { graphql = JSON.parse(Buffer.concat(chunks)); } catch { /* Invalid operations are denied and counted. */ }
    }
    const graphqlRead = typeof graphql?.query === 'string' && graphql.query.trim().startsWith('query ')
        && !/\bmutation\b/u.test(graphql.query);
    const write = !['GET', 'HEAD'].includes(method ?? '') && !graphqlRead;
    const credential = request.headers.authorization?.split(' ')[1];
    state.operations.push({ method, path, write });
    response.setHeader('content-type', 'application/json');
    const reply = (data, status = 200) => { response.statusCode = status; response.end(JSON.stringify(data)); };
    if (path === '/user' && credential === 'fixture-writer') return reply({ login: 'fixture-bot' });
    if (method === 'GET' && credential !== 'fixture-reader') return reply({ message: 'Unsupported fixture credential' }, 403);
    if (path === project) return reply({ id: 19, default_branch: 'master' });
    if (path === project + '/pulls/11') {
        if (state.denyPrivateRead) return reply({ message: 'Fixture private PR read denied' }, 403);
        const repo = { id: 19, owner: { login: 'owner' }, name: 'project' };
        const head = state.pushAfterConversation && state.conversationReads ? 'e'.repeat(40) : state.sourceHead;
        return reply({ number: 11, state: 'open', draft: false, changed_files: 1,
            head: { sha: head, ref: 'feature/reviewed', repo }, base: { sha: source.base, ref: 'develop', repo } });
    }
    if (path === project + '/git/ref/heads/develop') return reply({
        ref: 'refs/heads/develop', object: { type: 'commit', sha: source.baseRef } });
    if (path === project + '/actions/runs/23') return reply(state.run);
    if (path === project + '/actions/runs/24') return reply({ ...state.run, id: 24, run_attempt: 1,
        event: 'issue_comment', path: '.github/workflows/copilot_issue_comment.yml' });
    if (path === project + '/actions/workflows/copilot_pull_request.yml/runs') {
        return reply({ total_count: 1, workflow_runs: [state.run] });
    }
    if (path === project + '/commits/' + source.head + '/check-runs') return reply(check(state));
    if (method === 'POST' && path === '/graphql') {
        if (credential !== 'fixture-writer') return reply({ message: 'Unsupported fixture credential' }, 403);
        const body = graphql;
        if (!graphqlRead || body.variables?.issueNumber !== 11) return reply({ errors: [{ message: 'Unrecognized fixture query' }] }, 400);
        state.conversationReads = (state.conversationReads ?? 0) + 1;
        return reply({ data: { repository: { issueOrPullRequest: state.missingConversation ? null : {
            comments: { nodes: state.comment ? [state.comment] : [], pageInfo: { hasPreviousPage: false, startCursor: null } },
        } } } });
    }
    if (write) {
        if (credential !== 'fixture-writer' || path !== project + '/issues/comments/55' && path !== project + '/issues/11/comments') {
            return reply({ message: 'Unsupported fixture mutation' }, 405);
        }
        const data = [];
        for await (const chunk of request) data.push(chunk);
        const { body } = JSON.parse(Buffer.concat(data));
        if (state.refuseWrite) return reply({ message: 'Fixture write refused' }, 403);
        state.comment = { ...canonical, body };
        return reply({ id: 55, body });
    }
    return reply({ message: 'Unrecognized fixture endpoint' }, 404);
});

async function invoke(label, { kind = 'progress', runId = 23, attempt = 1, verifiedBody } = {}) {
    const eventPath = join(output, label + '.event.json');
    const work = { version: 1, kind, source, runId, attempt, ...(verifiedBody === undefined ? {} : { verifiedBody }) };
    writeFileSync(eventPath, JSON.stringify({ inputs: { pull_number: '11', work: JSON.stringify(work), operation: (kind === 'progress' ? String(state.sequence) + ':' : '') + createHash('sha256').update(JSON.stringify(work)).digest('hex') }, repository: { id: 19 } }));
    const api = 'http://127.0.0.1:' + server.address().port;
    const env = { PATH: process.env.PATH, HOME: join(output, 'fixture-home'),
        GITHUB_API_URL: api, GITHUB_GRAPHQL_URL: api + '/graphql', GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'owner/project', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR: 'fixture-bot',
        GITHUB_REF: 'refs/heads/master', GITHUB_WORKFLOW_REF: 'owner/project/' + cardPath + '@refs/heads/master',
        GITHUB_EVENT_PATH: eventPath, GITHUB_RUN_ID: '888', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTIONS: 'true',
        INPUT_TOKEN: 'fixture-writer', COPILOT_EVIDENCE_TOKEN: 'fixture-reader', COPILOT_BUGBOT_STATUS_CARD_WORKFLOW: 'write-v1',
        'INPUT_PULL-REQUESTS-LOCALE': 'en-US' };
    const firstOperation = state.operations.length;
    const observed = await new Promise((done, reject) => {
        const child = spawn(process.execPath, [bundle], { env, cwd: output, stdio: ['ignore', 'pipe', 'pipe'] });
        const data = [];
        const timer = setTimeout(() => { child.kill(); reject(new Error(label + ' timed out')); }, 15000);
        child.stdout.on('data', value => data.push(value));
        child.stderr.on('data', value => data.push(value));
        child.once('error', reject);
        child.once('close', code => { clearTimeout(timer); done({ code, log: Buffer.concat(data).toString('utf8') }); });
    });
    const operations = state.operations.slice(firstOperation);
    const writes = operations.filter(operation => operation.write);
    writeFileSync(join(output, label + '.log'), observed.log);
    result.outcomes.push({ label, exit: observed.code, reads: operations.length - writes.length, writes,
        logResult: observed.log.includes('publication updated') ? 'updated'
            : observed.log.includes('publication unchanged') ? 'unchanged'
            : observed.log.includes('publication created') ? 'created'
            : observed.log.includes('No current Bugbot status card') ? 'declined' : 'other' });
    return { ...observed, writes };
}

(async () => {
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    try {
        state = makeState();
        let run = await invoke('new-progress');
        assert.equal(run.code, 0, run.log);
        assert.deepEqual(run.writes.map(write => [write.method, write.path]), [['PATCH', project + '/issues/comments/55']]);
        assert.match(state.comment.body, /18\/50 partitions validated/u);
        assert.match(state.comment.body, /remaining partitions \(32\)/u);
        assert(state.comment.body.endsWith(previous));
        run = await invoke('identical-progress');
        assert.equal(run.code, 0, run.log);
        assert.equal(run.writes.length, 0);
        run = await invoke('independent-recheck', { kind: 'state-refresh', runId: 24, verifiedBody: current });
        assert.equal(run.code, 0, run.log);
        assert.equal(run.writes.length, 1);
        assert.match(state.comment.body, /18\/50 partitions validated/u);
        assert(state.comment.body.endsWith(current));
        run = await invoke('terminal-publication', { kind: 'analysis-result', verifiedBody: current });
        assert.equal(run.code, 0, run.log);
        assert.equal(run.writes.length, 1);
        assert(!state.comment.body.includes('partitions validated'));
        assert(state.comment.body.startsWith(current));
        run = await invoke('delayed-progress-after-terminal');
        assert.equal(run.code, 0, run.log);
        assert.equal(run.writes.length, 0);
        state.run.run_attempt = 2; state.sequence = 1; state.partitions = 2;
        run = await invoke('replaced-attempt');
        assert.equal(run.code, 1, run.log);
        assert.equal(run.writes.length, 0);
        run = await invoke('replacement-retry', { attempt: 2 });
        assert.equal(run.code, 0, run.log);
        assert.equal(run.writes.length, 1);
        assert.match(state.comment.body, /2\/50 partitions validated/u);
        state = makeState({ pushAfterConversation: true });
        run = await invoke('push-during-preflight');
        assert.equal(run.code, 1, run.log);
        assert.equal(run.writes.length, 0);
        state = makeState({ denyPrivateRead: true });
        run = await invoke('denied-private-pr-read');
        assert.notEqual(run.code, 0, run.log);
        assert.equal(run.writes.length, 0);
        assert.equal(state.comment.body, previous);
        state = makeState({ refuseWrite: true });
        run = await invoke('comment-write-refusal', { kind: 'analysis-result', verifiedBody: current });
        assert.equal(run.code, 1, run.log);
        assert.equal(run.writes.length, 1);
        assert.equal(state.comment.body, previous);
        state = makeState({ comment: undefined });
        run = await invoke('verified-empty-conversation');
        assert.equal(run.code, 0, run.log);
        assert.deepEqual(run.writes.map(write => [write.method, write.path]), [['POST', project + '/issues/11/comments']]);
        assert.match(state.comment.body, /No verified review yet/u);
        state = makeState({ missingConversation: true });
        run = await invoke('missing-conversation');
        result.missingConversationRejected = run.code !== 0 && run.writes.length === 0;
        assert(result.missingConversationRejected, 'An unavailable conversation must not create a status card.');
        assert.equal(state.comment.body, previous);
        const legacy = previous.split('\n').slice(1).join('\n');
        state = makeState({ comment: { ...canonical, body: legacy } });
        run = await invoke('legacy-card-progress');
        assert.equal(run.code, 0, run.log);
        assert.deepEqual(run.writes.map(write => [write.method, write.path]), [['PATCH', project + '/issues/comments/55']]);
        assert(state.comment.body.endsWith(legacy));
        run = await invoke('legacy-card-upgrade', { kind: 'analysis-result', verifiedBody: current });
        assert.equal(run.code, 0, run.log);
        assert.deepEqual(run.writes.map(write => [write.method, write.path]), [['PATCH', project + '/issues/comments/55']]);
        assert(state.comment.body.startsWith(current));
        const before = state.operations.length;
        const response = await fetch(`http://127.0.0.1:${server.address().port}/graphql`, {
            method: 'POST', headers: { authorization: 'token fixture-writer', 'content-type': 'application/json' },
            body: JSON.stringify({ query: 'mutation Audit { forbidden }' }),
        });
        assert.equal(response.status, 400);
        const attempts = state.operations.slice(before);
        assert.deepEqual(attempts, [{ method: 'POST', path: '/graphql', write: true }]);
        result.rejectedMutationAudited = true;
    } finally {
        writeFileSync(join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
        await new Promise(done => server.close(done));
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
