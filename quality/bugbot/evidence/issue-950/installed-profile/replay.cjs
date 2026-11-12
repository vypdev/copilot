'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
require('../normal-flow-shadow/run.cjs');

const { readGithubActionAiInputs } = require('../../../../../src/actions/github_action_ai_inputs.ts');
const { resolveBugbotShadowConfiguration } = require('../../../../../src/application/policies/bugbot_shadow_configuration_policy.ts');
const { createInstalledBugbotShadowVerifier } = require('../../../../../src/infrastructure/bugbot/installed_bugbot_shadow_adapter.ts');
const { askManagedBugbotShadowTurn } = require('../../../../../src/infrastructure/bugbot/shadow_verification_adapter.ts');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (directory, ...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
const planBytes = fs.readFileSync(path.join(__dirname, 'plan.json'));
const plan = JSON.parse(planBytes);

async function run(store, ledger) {
    assert(store && ledger, 'usage: node replay.cjs <local-domus-object-store> <new-ledger.jsonl>');
    const inputs = readGithubActionAiInputs(key => plan.actionInputs[key] ?? '');
    const detector = inputs.requestedAgentTasks.reviewer ?? inputs.requestedAgentTasks.findings;
    const configuration = resolveBugbotShadowConfiguration(detector, inputs.bugbotReviewConfiguration.shadowVerification);
    assert.equal(inputs.bugbotReviewConfiguration.publicationMode, 'dry-run');
    assert.deepEqual(configuration, { provider: 'codex', modelProvider: 'openai', model: 'gpt-6.1-sol', effort: 'xhigh' });
    for (const [sha, tree] of [[plan.head, plan.tree], [plan.base, plan.baseTree]]) {
        assert.equal(git(store, 'rev-parse', sha + '^{tree}'), tree);
    }

    const candidates = plan.cases.map(item => {
        const bytes = fs.readFileSync(path.join(__dirname, '../integrated-shadow-xhigh', item.ledger));
        const events = bytes.toString().trimEnd().split('\n').map(JSON.parse);
        const candidate = events.flatMap(event => event.event === 'archived-candidate' ? [event.candidate]
            : event.event === 'workflow-result' ? event.results[0].payload.bugbotShadowVerification.candidates.map(row => row.candidate) : [])
            .find(value => value.id === item.candidateId);
        assert(candidate && candidate.headSha === plan.head && candidate.baseSha === plan.base);
        assert.equal(candidate.repository.owner + '/' + candidate.repository.name, plan.repository);
        assert.equal(candidate.pullRequest, plan.pullRequest);
        return { candidate, producerLedgerSha256: hash(bytes) };
    });

    fs.writeFileSync(ledger, '', { flag: 'wx', mode: 0o600 });
    const record = event => fs.appendFileSync(ledger, JSON.stringify(event) + '\n');
    const cancel = new AbortController();
    const abort = () => cancel.abort();
    process.once('SIGINT', abort);
    process.once('SIGTERM', abort);
    const scratch = fs.mkdtempSync(path.join(tmpdir(), 'bugbot-installed-profile-'));
    try {
        const checkout = path.join(scratch, 'checkout');
        git(scratch, 'clone', '--quiet', '--shared', '--no-checkout', path.resolve(store), checkout);
        const before = git(checkout, 'status', '--porcelain');
        record({ event: 'plan', planSha256: hash(planBytes), detector, configuration, candidates });
        const adapter = createInstalledBugbotShadowVerifier(candidates[0].candidate.repository, checkout, async turn => {
            const modelTurn = await askManagedBugbotShadowTurn(turn);
            const { invocation, failure, usage, reportedModel, wallMs, promptSha256, schemaSha256 } = modelTurn.fact;
            record({ event: 'provider-turn', candidate: turn.candidateId, resumed: Boolean(turn.threadId),
                invocation, failure, usage, reportedModel, wallMs, promptSha256, schemaSha256 });
            return modelTurn;
        });
        await Promise.all(candidates.map(async ({ candidate }) => {
            const started = performance.now();
            const result = await adapter.verify({ candidate, configuration, signal: cancel.signal });
            record({ event: 'result', candidate: candidate.id, wallMs: Math.round(performance.now() - started), result });
        }));
        const checkoutUnchanged = git(checkout, 'status', '--porcelain') === before;
        record({ event: 'finished', checkoutUnchanged, githubMutationPorts: 0, githubWriteAttempts: 0 });
        assert(checkoutUnchanged);
    } finally {
        process.removeListener('SIGINT', abort);
        process.removeListener('SIGTERM', abort);
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}

run(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
