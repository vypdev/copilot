'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getOctokit } = require('@actions/github');
require('../normal-flow-shadow/run.cjs');

const { Ai } = require('../../../../../src/data/model/ai');
const { AgentCliClient } = require('../../../../../src/data/repository/agent_cli_client');
const { AgentExecutionPlanner } = require('../../../../../src/infrastructure/agents/agent_execution_planner');
const { codexInvocation } = require('../../../../../src/infrastructure/bugbot/shadow/session.cjs');
const { composeBugbotReview } = require('../../../../../src/infrastructure/composition/bugbot_review_composition');
const { createFindingsQueryPort } = require('../../../../../src/infrastructure/composition/agent_capability_composition_root');
const { readGithubActionAiInputs } = require('../../../../../src/actions/github_action_ai_inputs');
const { projectBugbotReviewOperationContext } = require('../../../../../src/application/usecases/steps/commit/bugbot/bugbot_review_operation_context');
const { createInstalledBugbotShadowVerifier } = require('../../../../../src/infrastructure/bugbot/installed_bugbot_shadow_adapter');
const { createGitHubBugbotCiReader } = require('../../../../../src/infrastructure/bugbot/github_bugbot_ci_reader');
const { askManagedBugbotShadowTurn } = require('../../../../../src/infrastructure/bugbot/shadow_verification_adapter');

const plan = require('./plan.json');
const hash = input => createHash('sha256').update(input).digest('hex');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.quotePath=true', ...args], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});
const snapshot = (source, value, count = 0) => ({
    value, coverage: { source, status: 'complete', pagesFetched: 1, itemsFetched: count, itemsRetained: count,
        omittedItems: 0, truncatedItems: 0, limitReached: false },
});
const args = ['diff', '--no-ext-diff', '--no-textconv', '--no-renames'];
const originalPullNumbers = { X1: 24, P1: 28, J1: 28 };

function comparison(checkout, subject) {
    const changes = [];
    const filesWithFirstDiffLine = [];
    const filesWithDiffLocations = [];
    const entries = git(checkout, ...args, '--name-status', '-z', subject.base, subject.head, '--', ...subject.paths).split('\0').slice(0, -1);
    for (let index = 0; index < entries.length; index += 2) {
        const [code, filename] = entries.slice(index, index + 2);
        const status = { A: 'added', D: 'removed', M: 'modified', T: 'changed' }[code];
        assert(status, 'unexpected diff status');
        const raw = git(checkout, ...args, '--unified=3', subject.base, subject.head, '--', filename);
        const marker = raw.indexOf('\n@@ ');
        const patch = marker === -1 ? '' : raw.slice(marker + 1);
        const locations = [];
        let left = 0, right = 0, additions = 0, deletions = 0;
        for (const line of patch.split('\n')) {
            const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
            if (hunk) { left = Number(hunk[1]); right = Number(hunk[2]); }
            else if (line.startsWith('+')) { locations.push({ line: right++, side: 'RIGHT' }); additions++; }
            else if (line.startsWith('-')) { locations.push({ line: left++, side: 'LEFT' }); deletions++; }
            else if (line.startsWith(' ')) { left++; right++; }
        }
        const first = locations.find(location => location.side === 'RIGHT') ?? locations[0];
        if (first) filesWithFirstDiffLine.push({ path: filename, firstLine: first.line });
        if (locations.length) filesWithDiffLocations.push({ path: filename, locations });
        changes.push({ filename, status, additions, deletions, patch });
    }
    return { changes, filesWithFirstDiffLine, filesWithDiffLocations };
}

function readSubject(id, checkout) {
    const bytes = fs.readFileSync(path.join(__dirname, '../v4/manifest.json'));
    assert.equal(hash(bytes), plan.repositoryCohort.manifestSha256);
    const subject = JSON.parse(bytes).subjects.find(item => item.id === id);
    assert(subject);
    assert.equal(git(checkout, 'remote'), '');
    assert.equal(git(checkout, 'rev-parse', 'HEAD').trim(), subject.head);
    assert.equal(git(checkout, 'rev-parse', 'HEAD^{tree}').trim(), subject.tree);
    assert.equal(hash(git(checkout, ...args, '--unified=3', subject.base, subject.head, '--', ...subject.paths)), subject.diffSha256);
    return subject;
}

async function run(checkout, id, repetition, output, preflight = false) {
    assert(checkout && plan.repositoryCohort.order.includes(id) && [1, 2, 3].includes(repetition) && output);
    checkout = fs.realpathSync(checkout);
    output = path.resolve(output);
    const subject = readSubject(id, checkout);
    assert.equal(git(checkout, 'status', '--porcelain'), '');
    fs.writeFileSync(output, '', { flag: 'wx', mode: 0o600 });
    const log = row => fs.appendFileSync(output, JSON.stringify(row) + '\n');
    log({ event: 'start', subject, repetition, implementation: plan.implementation, startedAt: new Date().toISOString() });
    const repository = { owner: 'vypdev', name: id.startsWith('U') ? 'ha-ui' : 'domus' };
    const number = originalPullNumbers[id] ?? 1;
    const branch = 'feature/reviewed-source';
    const identity = { number, state: 'open', draft: false, baseRepository: repository, baseSha: subject.base,
        baseRefSha: subject.base, baseRef: 'develop', headRepositoryOwner: repository.owner, headRepositoryName: repository.name,
        headRef: branch, headSha: subject.head };
    const diff = comparison(checkout, subject);
    const writes = [];
    const guard = new Proxy({}, { get: (_target, method) => () => {
        writes.push(String(method));
        log({ event: 'forbidden-write', method: String(method) });
        throw new Error('forbidden GitHub mutation');
    } });
    const scm = {
        context: {
            getPullRequest: async () => identity, getSourceBoundPullRequest: async () => identity,
            findOpenPullRequestsByExactHead: async () => [],
            listIssueComments: async () => snapshot('issue-comments', []),
            listPullRequestReviewComments: async () => snapshot('pull-request-comments', []),
            listPullRequestReviewThreadStates: async () => snapshot('review-threads', {}),
            getReviewDiffSnapshot: async () => snapshot('diff', diff, diff.changes.length),
            getPullRequestHeadSha: async () => subject.head, getPullRequestReviewCommentBody: async () => null,
            loadRules: async () => [],
        },
        publication: { issueComments: guard, pullRequestComments: guard },
        resolution: { issueComments: guard, pullRequestComments: guard },
        reconciliation: { snapshot: guard, presentation: { comments: guard, updatePullRequestReview: guard.updatePullRequestReview } },
    };
    const inputs = readGithubActionAiInputs(key => ({
        'bugbot-dry-run': 'true', 'bugbot-verification-mode': 'shadow', 'reviewer-provider': plan.detector.provider,
        'reviewer-model-provider': plan.detector.modelProvider, 'reviewer-model': plan.detector.model,
        'reviewer-effort': plan.detector.effort, 'bugbot-verifier-model': plan.verifier.model,
        'bugbot-verifier-effort': plan.verifier.effort,
    }[key] ?? ''));
    const ai = new Ai('ev07', '', false, [], false, 'low', 20, [], inputs.requestedAgentTasks, undefined, inputs.bugbotReviewConfiguration);
    const operation = projectBugbotReviewOperationContext({
        ai, owner: repository.owner, repo: repository.name, issueNumber: number, isPullRequest: true, eventName: 'pull_request',
        tokenUser: 'copilot', locale: { issue: 'en-US', pullRequest: 'en-US' },
        pullRequest: { number, head: branch, action: 'opened' }, commit: { branch }, branches: {}, currentConfiguration: { parentBranch: 'develop' },
        inputs: { pull_request: { head: { sha: subject.head, repo: { owner: { login: repository.owner } } } } },
    });
    assert.deepEqual(operation.analysis.agentConfiguration, plan.detector);
    process.chdir(checkout);
    const planner = new AgentExecutionPlanner();
    const detector = preflight ? { query: async ({ prompt }) => ({
        outputLocale: 'en-US', findings: [], resolved_findings: [],
        partition_id: prompt.match(/Return partition_id exactly as `([^`]+)`/u)?.[1],
        reviewed_head_sha: subject.head,
    }) }
        : createFindingsQueryPort({ cli: new AgentCliClient({ prepare(request) {
            const execution = planner.prepare(request);
            const flags = codexInvocation(execution.argv);
            try {
                assert.deepEqual(flags, { model: plan.detector.model, modelProvider: plan.detector.modelProvider,
                    reasoningEffort: plan.detector.effort, sandbox: 'read-only' });
                log({ event: 'detector-admitted', flags });
            } catch (error) {
                fs.rmSync(execution.runtimeDirectory, { recursive: true, force: true });
                throw error;
            }
            return execution;
        } }, { observe(fact) { log({ event: 'detector', fact }); } }) });
    const cancel = new AbortController();
    process.once('SIGINT', () => cancel.abort());
    process.once('SIGTERM', () => cancel.abort());
    const ci = preflight ? undefined : createGitHubBugbotCiReader({ owner: repository.owner, repo: repository.name },
        getOctokit(execFileSync('gh', ['auth', 'token', '--hostname', 'github.com'], { encoding: 'utf8' }).trim()).rest.actions);
    const verifier = createInstalledBugbotShadowVerifier(repository, checkout, async turn => {
        assert.deepEqual(turn.configuration, plan.verifier);
        const result = await askManagedBugbotShadowTurn(turn);
        log({ event: 'verifier', candidate: turn.candidateId, fact: result.fact });
        return result;
    }, ci);
    const started = performance.now();
    const results = await composeBugbotReview({ scm, findings: {
        query: request => detector.query({ ...request, signal: cancel.signal }),
    }, shadowVerification: { verify: request => verifier.verify({ ...request, signal: cancel.signal }) } }).invoke(operation);
    const result = results[0];
    log({ event: 'result', wallMs: Math.round(performance.now() - started), success: result?.success,
        payload: result?.payload, githubWriteAttempts: writes.length, checkoutUnchanged: git(checkout, 'status', '--porcelain') === '' });
    assert.deepEqual(writes, []);
    assert.equal(result?.payload?.dryRun, true);
    assert.equal(result.success, true);
    if (preflight) assert.equal(result.payload.bugbotShadowVerification.publicationSimulation.status, 'complete');
}

run(process.argv[2], process.argv[3], Number(process.argv[4]), process.argv[5], process.argv[6] === '--preflight')
    .catch(error => { console.error(error.code ?? error.name, error.message); process.exitCode = 1; });
