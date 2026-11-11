'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createShadowVerifier } = require('../shadow-verification/adapter.cjs');
const frozen = require('./subjects.json');
const root = path.resolve(__dirname, '../../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const load = file => require(path.join(root, 'src', file));
const { DetectPotentialProblemsUseCase } = load('application/usecases/steps/commit/detect_potential_problems_use_case');
const { projectBugbotReviewOperationContext } = load('application/usecases/steps/commit/bugbot/bugbot_review_operation_context');
const { buildAgentTasksFromValues } = load('actions/agent_input_builder');
const { Ai } = load('data/model/ai');
const { createFindingsQueryPort } = load('infrastructure/composition/agent_capability_composition_root');

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

async function run(lab, number, destination) {
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
        const tasks = buildAgentTasksFromValues({ 'reviewer-model': subject.model, 'reviewer-effort': frozen.effort });
        const ai = new Ai('shadow-campaign', '', false, [], false, 'low', 20, [], tasks, undefined,
            { publicationMode: frozen.publication });
        const operation = projectBugbotReviewOperationContext({
            ai, owner, repo: name, issueNumber: subject.number, isPullRequest: true, eventName: 'pull_request',
            tokenUser: 'copilot', locale: { issue: 'en-US', pullRequest: 'en-US' },
            pullRequest: { number: subject.number, head: subject.headRef, action: 'opened' },
            commit: { branch: subject.headRef }, currentConfiguration: { parentBranch: subject.baseRef }, branches: {},
            inputs: { pull_request: { head: { sha: subject.head, repo: { owner: { login: owner } } } } },
        });
        const standardDetector = createFindingsQueryPort();
        const started = Date.now();
        log({ event: 'plan', subject, files: diff.changes.length, comparisonSha256: hash(JSON.stringify(diff)),
            configuration: operation.analysis.agentConfiguration, subjectsSha256: hash(fs.readFileSync(path.join(__dirname, 'subjects.json'))),
            cli: execFileSync('codex', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
            implementation: git(root, 'rev-parse', 'HEAD').trim(), runnerSha256: hash(fs.readFileSync(__filename)) });
        let invocation = 0;
        const detector = { async query(request) {
            const turn = ++invocation;
            const time = Date.now();
            log({ event: 'detector-start', turn, resolvedModel: request.configuration.model, promptSha256: hash(request.prompt) });
            try {
                const answer = await standardDetector.query(request);
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
        const verifier = createShadowVerifier(lab, log);
        const results = await new DetectPotentialProblemsUseCase(detector, scm, undefined, undefined, verifier).invoke(operation);
        log({ event: 'workflow-result', results, writes, checkoutUnchanged: git(checkout, 'status', '--porcelain') === '',
            wallMs: Date.now() - started });
        assert.deepEqual(writes, []);
    } finally {
        process.chdir(originalCwd);
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}

run(...process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
