'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const official = require('../shadow-real-prs/official.json');
const shadowPlan = require('../shadow-verification/plan.json');
const root = path.resolve(__dirname, '../../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const load = file => require(path.join(root, 'src', file));
const { composeBugbotReview } = load('infrastructure/composition/bugbot_review_composition');
const { createPinnedBugbotShadowVerifier } = load('infrastructure/bugbot/shadow_verification_adapter');
const { ask, codexInvocation } = load('infrastructure/bugbot/shadow/session.cjs');
const { projectBugbotReviewOperationContext } = load('application/usecases/steps/commit/bugbot/bugbot_review_operation_context');
const { buildAgentTasksFromValues } = load('actions/agent_input_builder');
const { Ai } = load('data/model/ai');
const { createFindingsQueryPort } = load('infrastructure/composition/agent_capability_composition_root');
const { AgentCliClient } = load('data/repository/agent_cli_client');
const { AgentExecutionPlanner } = load('infrastructure/agents/agent_execution_planner');
const { resolveBugbotReviewEffort } = load('domain/bugbot/review_configuration');

const hash = text => createHash('sha256').update(text).digest('hex');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null', ...args],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const snapshot = (source, value, count = 0) => ({
    value, coverage: { source, status: 'complete', pagesFetched: 1, itemsFetched: count, itemsRetained: count,
        omittedItems: 0, truncatedItems: 0, limitReached: false },
});

function comparison(checkout, subject) {
    const diff = ['diff', '--no-ext-diff', '--no-textconv', '--no-renames'];
    const entries = git(checkout, ...diff, '--name-status', '-z', subject.base, subject.head).split('\0').slice(0, -1);
    const changes = [];
    const filesWithFirstDiffLine = [];
    const filesWithDiffLocations = [];
    for (let index = 0; index < entries.length; index += 2) {
        const [code, filename] = entries.slice(index, index + 2);
        const raw = git(checkout, ...diff, '--unified=3', subject.base, subject.head, '--', filename);
        const patch = raw.includes('\n@@ ') ? raw.slice(raw.indexOf('\n@@ ') + 1) : '';
        const lines = patch.split('\n');
        const status = { A: 'added', D: 'removed', M: 'modified', T: 'changed' }[code];
        assert(status, 'unexpected diff status ' + code);
        const locations = [];
        let left = 0, right = 0;
        for (const line of lines) {
            const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
            if (hunk) { left = Number(hunk[1]); right = Number(hunk[2]); }
            else if (line.startsWith('+')) locations.push({ line: right++, side: 'RIGHT' });
            else if (line.startsWith('-')) locations.push({ line: left++, side: 'LEFT' });
            else if (line.startsWith(' ')) { left++; right++; }
        }
        const first = locations.find(location => location.side === 'RIGHT') ?? locations[0];
        if (first) filesWithFirstDiffLine.push({ path: filename, firstLine: first.line });
        if (locations.length) filesWithDiffLocations.push({ path: filename, locations });
        changes.push({ filename, status, additions: lines.filter(line => line.startsWith('+')).length,
            deletions: lines.filter(line => line.startsWith('-')).length, patch });
    }
    return { changes, filesWithFirstDiffLine, filesWithDiffLocations };
}

async function run(lab, number, destination, manifestPath = path.join(__dirname, 'subjects.json')) {
    const manifest = fs.readFileSync(manifestPath);
    const frozen = JSON.parse(manifest);
    const { workflowInputs } = frozen;
    assert.equal(frozen.publication, 'dry-run');
    const subject = frozen.subjects.find(item => item.number === Number(number));
    assert(subject, 'unknown pinned PR');
    const [owner, name] = subject.repository.split('/');
    const source = path.join(lab, name + '.git');
    assert.equal(git(source, 'remote'), '');
    for (const [sha, tree] of [[subject.head, subject.tree], [subject.base, subject.baseTree]]) {
        assert.equal(git(source, 'rev-parse', sha + '^{tree}').trim(), tree);
    }
    const scratch = fs.mkdtempSync(path.join(tmpdir(), 'bugbot-normal-flow-'));
    const checkout = path.join(scratch, name);
    const originalCwd = process.cwd();
    const stream = path.resolve(destination);
    fs.writeFileSync(stream, '', { flag: 'wx', mode: 0o600 });
    const log = event => fs.appendFileSync(stream, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
    const cancellation = new AbortController();
    const cancel = () => cancellation.abort();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    const signal = cancellation.signal;
    const withCancellation = original => original ? AbortSignal.any([original, signal]) : signal;
    const writes = [];
    const guard = new Proxy({}, { get: (_target, method) => () => {
        writes.push(String(method));
        log({ event: 'forbidden-write', method: String(method) });
        throw new Error('forbidden GitHub mutation');
    } });
    try {
        git(scratch, 'clone', '-q', '--shared', '--no-checkout', source, checkout);
        git(checkout, 'remote', 'remove', 'origin');
        git(checkout, 'checkout', '-q', '--detach', subject.head);
        assert.equal(git(checkout, 'remote'), '');
        assert.equal(git(checkout, 'status', '--porcelain'), '');
        process.chdir(checkout);
        const diff = comparison(checkout, subject);
        const repository = { owner, name };
        const identity = { number: subject.number, state: 'open', draft: false,
            baseRepository: repository, baseSha: subject.base, baseRefSha: subject.base, baseRef: subject.baseRef,
            headRepositoryOwner: owner, headRepositoryName: name, headRef: subject.headRef,
            headSha: subject.head, changedFileCount: diff.changes.length };
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
        if (workflowInputs) {
            assert.equal(process.env.REVIEWER_EFFORT, workflowInputs.REVIEWER_EFFORT);
            assert.equal(process.env.BUGBOT_EFFORT, workflowInputs.BUGBOT_EFFORT);
            const runtime = execFileSync(process.env.PILOT_LOCAL_PYTHON, ['-c',
                'import platform,sqlite3; print(platform.python_version(), sqlite3.sqlite_version)'], { encoding: 'utf8' }).trim();
            assert.equal(runtime, shadowPlan.localRuntime.python + ' ' + shadowPlan.localRuntime.sqlite);
            log({ event: 'local-runtime', runtime, scope: shadowPlan.localRuntime.scope });
        }
        const tasks = buildAgentTasksFromValues({ 'reviewer-model': subject.model,
            'reviewer-effort': workflowInputs ? process.env.REVIEWER_EFFORT : frozen.effort });
        const reviewEffort = workflowInputs ? process.env.BUGBOT_EFFORT : 'default';
        const ai = new Ai('shadow-campaign', '', false, workflowInputs ? ['build/*', 'specs/CATALOG.md'] : [], false,
            'low', 20, [], tasks, undefined, { publicationMode: frozen.publication, effort: reviewEffort });
        const operation = projectBugbotReviewOperationContext({
            ai, owner, repo: name, issueNumber: subject.number, isPullRequest: true, eventName: 'pull_request',
            tokenUser: 'copilot', locale: { issue: 'en-US', pullRequest: 'en-US' },
            pullRequest: { number: subject.number, head: subject.headRef, action: 'opened' },
            commit: { branch: subject.headRef }, currentConfiguration: { parentBranch: subject.baseRef }, branches: {},
            inputs: { pull_request: { head: { sha: subject.head, repo: { owner: { login: owner } } } } },
        });
        const selected = operation.analysis.agentConfiguration;
        const planner = new AgentExecutionPlanner();
        const attest = invocation => {
            assert.equal(invocation.model, selected.model);
            assert.equal(invocation.reasoningEffort, selected.effort);
            assert.equal(invocation.modelProvider, selected.modelProvider);
            assert.equal(invocation.sandbox, 'read-only');
        };
        const standardDetector = createFindingsQueryPort({ cli: new AgentCliClient({
            prepare(request) {
                const plan = planner.prepare(request);
                const flags = codexInvocation(plan.argv);
                attest(flags);
                log({ event: 'detector-invocation', invocation: flags, capability: plan.capability, atMs: sinceStart() });
                return plan;
            },
        }, { observe(observation) {
            if (observation.state === 'failed') log({ event: 'detector-provider-failure', observation, atMs: sinceStart() });
        } }) });
        const started = performance.now();
        const sinceStart = () => Math.round(performance.now() - started);
        const reviewed = diff.changes.filter(change => !workflowInputs || change.filename !== 'specs/CATALOG.md'
            && !change.filename.startsWith('build/'));
        const effectiveDepth = resolveBugbotReviewEffort(reviewEffort, {
            files: reviewed.length,
            additions: reviewed.reduce((sum, change) => sum + change.additions, 0),
            deletions: reviewed.reduce((sum, change) => sum + change.deletions, 0),
            touchesSensitivePath: reviewed.some(change => /(^|\/)(auth|security|permissions?|credentials?|secrets?|payments?|migrations?)(\/|\.|$)/i.test(change.filename)),
        });
        log({ event: 'plan', subject, files: diff.changes.length, comparisonSha256: hash(JSON.stringify(diff)),
            configuration: selected, workflowInputs, reviewEffort, effectiveDepth, subjectsSha256: hash(manifest),
            cli: execFileSync('codex', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
            implementation: git(root, 'rev-parse', 'HEAD').trim(), runnerSha256: hash(fs.readFileSync(__filename)) });
        let invocation = 0;
        const detector = { async query(request) {
            const turn = ++invocation;
            const time = Date.now();
            log({ event: 'detector-start', turn, resolvedModel: request.configuration.model, promptSha256: hash(request.prompt) });
            try {
                const answer = await standardDetector.query({ ...request, signal: withCancellation(request.signal) });
                const findings = Array.isArray(answer?.findings) ? answer.findings.map(
                    ({ id, title, file, line, endLine }) => ({ id, title, file, line, endLine }),
                ) : null;
                log({ event: 'detector-result', turn, findings, resolvedModel: request.configuration.model,
                    reportedModel: null, wallMs: Date.now() - time });
                return answer;
            } catch (error) {
                log({ event: 'detector-failure', turn, code: error.code ?? error.name,
                    category: error.cause?.category, message: error.cause?.message?.slice(0, 500),
                    wallMs: Date.now() - time });
                throw error;
            }
        } };
        let active = 0, peak = 0, firstVerifier, lastVerifier;
        const verifier = {
            async verify(request) {
                const { candidate, configuration } = request;
                assert.deepEqual(configuration, selected);
                const startedAt = sinceStart();
                firstVerifier ??= startedAt;
                active += 1;
                peak = Math.max(peak, active);
                log({ event: 'verifier-start', id: candidate.id, active, atMs: startedAt });
                const adapter = createPinnedBugbotShadowVerifier({ log,
                    resolveSource: input => input.repository.owner === owner && input.repository.name === name
                        && input.headSha === subject.head && input.baseSha === subject.base
                        ? { repo: source, officialDirectory: lab, catalog: official,
                            ...(workflowInputs && { localRuntime: shadowPlan.localRuntime }) } : undefined,
                    transport: turn => ask({ ...turn,
                        onInvocation(flags) {
                            attest(flags);
                            log({ event: 'verifier-invocation', id: candidate.id, invocation: flags,
                                continuation: Boolean(turn.threadId), atMs: sinceStart() });
                        },
                    }),
                });
                try {
                    return await adapter.verify({ ...request, signal: withCancellation(request.signal) });
                } finally {
                    active -= 1;
                    lastVerifier = sinceStart();
                    log({ event: 'verifier-finish', id: candidate.id, active, atMs: lastVerifier,
                        wallMs: lastVerifier - startedAt });
                }
            },
        };
        const results = await composeBugbotReview({ findings: detector, scm, shadowVerification: verifier }).invoke(operation);
        const wallMs = sinceStart();
        log({ event: 'workflow-result', results, writes, checkoutUnchanged: git(checkout, 'status', '--porcelain') === '',
            wallMs, verificationWallMs: firstVerifier === undefined ? 0 : lastVerifier - firstVerifier,
            peakVerifierConcurrency: peak });
        assert.deepEqual(writes, []);
    } finally {
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
        process.chdir(originalCwd);
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}

run(...process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
