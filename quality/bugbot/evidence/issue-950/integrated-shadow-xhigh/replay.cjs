'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { subjects } = require('./subjects.json');
const archived = require('../shadow-real-prs/cohort.json');
const catalog = require('../shadow-real-prs/official.json');
const root = path.resolve(__dirname, '../../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const runtime = path.join(root, 'src/infrastructure/bugbot');
const { createPinnedBugbotShadowVerifier } = require(path.join(runtime, 'shadow_verification_adapter.ts'));
const { git } = require(path.join(runtime, 'shadow/git.cjs'));
const { ask } = require(path.join(runtime, 'shadow/session.cjs'));
const { buildAgentTasksFromValues } = require(path.join(root, 'src/actions/agent_input_builder.ts'));

async function run(lab, output) {
    const subject = subjects.find(item => item.number === 28);
    const original = archived.find(item => item.pr === 28 && item.head === subject.head);
    assert.equal(original.base, subject.base);
    assert.equal(original.tree, subject.tree);
    const finding = original.findings[0];
    const repo = path.join(lab, 'domus.git');
    assert.equal(git(repo, ['rev-parse', `${subject.head}^{tree}`]).trim(), subject.tree);
    assert.equal(git(repo, ['rev-parse', `${subject.base}^{tree}`]).trim(), subject.baseTree);
    const configuration = buildAgentTasksFromValues({ 'reviewer-model': subject.model,
        'reviewer-effort': process.env.REVIEWER_EFFORT }).reviewer;
    assert.equal(configuration.effort, 'xhigh');
    const candidate = Object.freeze({ id: finding.id, hypothesis: finding.hypothesis, anchor: finding.detectorLocation,
        repository: { owner: 'vypdev', name: 'domus' }, pullRequest: 28, headSha: subject.head,
        baseSha: subject.base, allowBase: finding.allowBase });
    fs.writeFileSync(output, '', { flag: 'wx', mode: 0o600 });
    const log = event => fs.appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
    const cancellation = new AbortController();
    const cancel = () => cancellation.abort();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    log({ event: 'archived-candidate', candidate, configuration, producer: original.producerUrl,
        commentSnapshotSha256: finding.commentSnapshotSha256 });
    try {
        const adapter = createPinnedBugbotShadowVerifier({ log, lifecycle: false,
            resolveSource: input => input === candidate ? { repo, officialDirectory: lab, catalog } : undefined,
            transport: turn => ask({ ...turn, onInvocation(invocation) {
                assert.equal(invocation.model, configuration.model);
                assert.equal(invocation.modelProvider, configuration.modelProvider);
                assert.equal(invocation.reasoningEffort, configuration.effort);
                assert.equal(invocation.sandbox, 'read-only');
                log({ event: 'verifier-invocation', invocation, continuation: Boolean(turn.threadId) });
            } }),
        });
        const result = await adapter.verify({ candidate, configuration, signal: cancellation.signal });
        log({ event: 'replay-result', result });
    } finally {
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
    }
}

run(...process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
