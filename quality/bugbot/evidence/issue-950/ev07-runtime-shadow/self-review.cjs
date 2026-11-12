'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const [sdk, checkout, planFile, output] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const from = file => require(path.join(sdk, 'src', file));
require(path.join(sdk, 'quality/bugbot/evidence/issue-950/normal-flow-shadow/run.cjs'));
const { Ai } = from('data/model/ai');
const { AgentCliClient } = from('data/repository/agent_cli_client');
const { AgentExecutionPlanner } = from('infrastructure/agents/agent_execution_planner');
const { codexInvocation } = from('infrastructure/bugbot/shadow/session.cjs');
const { composeBugbotReview } = from('infrastructure/composition/bugbot_review_composition');
const { createBugbotCompositionRoot } = from('infrastructure/composition/bugbot_composition_root');
const { createFindingsQueryPort } = from('infrastructure/composition/agent_capability_composition_root');
const { readGithubActionAiInputs } = from('actions/github_action_ai_inputs');
const { projectBugbotReviewOperationContext } = from('application/usecases/steps/commit/bugbot/bugbot_review_operation_context');
const { createInstalledBugbotShadowVerifier } = from('infrastructure/bugbot/installed_bugbot_shadow_adapter');
const { createGitHubBugbotCiReader } = from('infrastructure/bugbot/github_bugbot_ci_reader');
const { askManagedBugbotShadowTurn } = from('infrastructure/bugbot/shadow_verification_adapter');
const { getOctokit } = require(path.join(sdk, 'node_modules/@actions/github'));

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const log = row => fs.appendFileSync(output, JSON.stringify(row) + '\n', { mode: 0o600 });
const repository = { owner: 'vypdev', name: 'copilot' };

async function run() {
    assert.equal(git(sdk, 'rev-parse', 'HEAD'), plan.headSha);
    assert.equal(git(checkout, 'rev-parse', 'HEAD'), plan.headSha);
    assert.equal(git(checkout, 'merge-base', plan.baseSha, plan.headSha), plan.baseSha);
    assert.equal(git(checkout, 'remote'), '');
    assert.equal(git(checkout, 'status', '--porcelain'), '');
    fs.writeFileSync(output, '', { flag: 'wx', mode: 0o600 });
    log({ event: 'start', plan, at: new Date().toISOString() });
    const token = execFileSync('gh', ['auth', 'token', '--hostname', 'github.com'], { encoding: 'utf8' }).trim();
    process.chdir(checkout);
    const action = createBugbotCompositionRoot({ owner: repository.owner, repository: repository.name, token });
    const identity = await action.scm.context.getSourceBoundPullRequest(951);
    assert(identity?.draft && identity.headSha === plan.headSha && identity.baseRefSha === plan.baseSha);
    const writes = [];
    const deny = new Proxy({}, { get: (_target, method) => () => {
        writes.push(String(method));
        log({ event: 'forbidden-write', method: String(method) });
        throw new Error('forbidden-github-mutation');
    } });
    const scm = {
        reviewSource: action.scm.reviewSource,
        context: action.scm.context,
        publication: { issueComments: deny, pullRequestComments: deny },
        resolution: { issueComments: deny, pullRequestComments: deny },
        reconciliation: { snapshot: action.scm.reconciliation.snapshot, presentation: { comments: deny, updatePullRequestReview: deny.updatePullRequestReview } },
    };
    const inputs = readGithubActionAiInputs(key => ({
        'bugbot-dry-run': 'true', 'bugbot-review-drafts': 'true', 'bugbot-verification-mode': 'shadow',
        'reviewer-provider': 'codex', 'reviewer-model-provider': 'openai', 'reviewer-model': plan.detector.model,
        'reviewer-effort': plan.detector.effort, 'bugbot-verifier-model': plan.verifier.model, 'bugbot-verifier-effort': plan.verifier.effort,
    }[key] ?? ''));
    const ai = new Ai('self-review', '', false, plan.ignored, false, 'low', 20, [], inputs.requestedAgentTasks, undefined, inputs.bugbotReviewConfiguration);
    const operation = projectBugbotReviewOperationContext({
        ai, owner: repository.owner, repo: repository.name, issueNumber: 951, isPullRequest: true, eventName: 'pull_request',
        tokenUser: 'copilot', locale: { issue: 'en-US', pullRequest: 'en-US' },
        pullRequest: { number: 951, head: identity.headRef, action: 'synchronize' }, commit: { branch: identity.headRef },
        branches: {}, currentConfiguration: { parentBranch: identity.baseRef },
        inputs: { pull_request: { draft: true, head: { sha: plan.headSha, repo: { owner: { login: repository.owner } } } } },
    });
    assert.deepEqual(operation.analysis.agentConfiguration, plan.detector);
    const planner = new AgentExecutionPlanner();
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    const detector = createFindingsQueryPort({ cli: new AgentCliClient({ prepare(request) {
        const prepared = planner.prepare(request);
        const flags = codexInvocation(prepared.argv);
        try {
            assert.deepEqual(flags, { model: plan.detector.model, modelProvider: 'openai', reasoningEffort: plan.detector.effort, sandbox: 'read-only' });
            log({ event: 'detector-admitted', flags });
        } catch (error) {
            fs.rmSync(prepared.runtimeDirectory, { recursive: true, force: true });
            throw error;
        }
        return prepared;
    } }, { observe(fact) { log({ event: 'detector', fact }); } }) });
    const ci = createGitHubBugbotCiReader(repository, getOctokit(token).rest.actions);
    const verifier = createInstalledBugbotShadowVerifier(repository, checkout, async turn => {
        assert.deepEqual(turn.configuration, plan.verifier);
        const result = await askManagedBugbotShadowTurn(turn);
        log({ event: 'verifier-turn', candidate: turn.candidateId, fact: result.fact });
        return result;
    }, ci);
    const start = performance.now();
    const results = await composeBugbotReview({
        scm,
        findings: { query: request => detector.query({ ...request, signal: controller.signal }) },
        shadowVerification: { verify: request => verifier.verify({ ...request, signal: controller.signal }) },
    }).invoke(operation);
    const result = results[0];
    const unchanged = git(checkout, 'status', '--porcelain') === '';
    log({ event: 'result', success: result?.success, wallMs: Math.round(performance.now() - start),
        payload: result?.payload, errors: result?.errors?.map(error => ({ code: error.code })), githubWriteAttempts: writes.length,
        checkoutUnchanged: unchanged });
    assert.equal(writes.length, 0);
    assert(unchanged);
}

run().catch(error => {
    log({ event: 'failure', failure: error.code ?? error.name });
    console.error(error.code ?? error.name);
    process.exitCode = 1;
});
