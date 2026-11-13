'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [runnerRoot, lab, inputs, out] = process.argv.slice(2);
const historical = path.join(runnerRoot, 'quality/bugbot/evidence/issue-950/shadow-real-prs');
const shadow = path.join(runnerRoot, 'quality/bugbot/evidence/issue-950/shadow-verification');
const { investigate } = require(path.join(shadow, 'run.cjs'));
const { ask } = require(path.join(shadow, 'session.cjs'));
const { hash } = require(path.join(historical, 'session.cjs'));
const { git, blob } = require(path.join(historical, 'broker.cjs'));
const catalog = require(path.join(historical, 'official.json'));
const plan = require(path.join(shadow, 'plan.json'));

async function main() {
    const bytes = fs.readFileSync(inputs);
    const frozen = JSON.parse(bytes);
    assert.equal(frozen.runnerCommit, '92791402bd1ac6cc9fe214ec4a2d43ce8dd2760a');
    assert.equal(git(runnerRoot, ['rev-parse', 'HEAD']).trim(), frozen.runnerCommit);
    assert.equal(git(runnerRoot, ['status', '--porcelain']), '');
    assert.equal(plan.publication, 'dry-run');
    assert.deepEqual([plan.provider, plan.model, plan.effort], ['openai', 'gpt-6.1-sol', 'low']);
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], {encoding:'utf8'}).trim(), plan.cli);
    const runtime = execFileSync('python3', ['-c','import platform,sqlite3; print(platform.python_version(),sqlite3.sqlite_version)'],
        {encoding:'utf8'}).trim();
    assert.equal(runtime, plan.localRuntime.python + ' ' + plan.localRuntime.sqlite);
    for (const source of catalog) assert.equal(hash(fs.readFileSync(path.join(lab,source.file))), source.sha256);
    assert.equal(frozen.cases.length, 2);
    const repo = path.join(lab, 'domus.git');
    assert.equal(git(repo, ['remote']), '');
    for (const { subject, finding } of frozen.cases) {
        assert.equal(git(repo, ['rev-parse', subject.head + '^{tree}']).trim(), subject.tree);
        const { path: file, line, end } = finding.detectorLocation;
        assert(line >= 1 && line <= end && end <= blob(repo, subject.head, file).lines.length);
    }

    fs.writeFileSync(out, '', {flag:'wx',mode:0o600});
    const log = event => fs.appendFileSync(out, JSON.stringify({at:new Date().toISOString(),...event}) + '\n');
    log({event:'plan',runnerCommit:frozen.runnerCommit,inputsSha256:hash(bytes),profile:{model:plan.model,effort:plan.effort,
        cli:plan.cli,caseMs:plan.caseMs,turnMs:plan.turnMs},findings:frozen.cases.map(({finding})=>finding.id)});
    const cancel = new AbortController();
    process.once('SIGINT', () => cancel.abort());
    process.once('SIGTERM', () => cancel.abort());

    const runs = await Promise.all(frozen.cases.map(async ({subject,finding}) => {
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bugbot-live-follow-up-'));
        let turn = 0;
        try {
            const result = await investigate(lab,subject,finding,cwd,async request => {
                const current = ++turn;
                const actual = await ask(request);
                log({event:'provider-turn',finding:finding.id,turn:current,fact:actual.fact,
                    action:actual.response?.action ?? null, proposedVerdict:actual.response?.verdict ?? null,
                    requests:actual.response?.action === 'investigate' ? actual.response.requests : []});
                return actual;
            }, log, cancel.signal);
            log(result);
            console.log(finding.id, result.answer?.label ?? result.failure, result.turns.length, result.wallMs);
            return result;
        } finally {
            fs.rmSync(cwd,{recursive:true,force:true});
        }
    }));
    assert(runs.every(run=>run.writes.length===0));
    const initialThreads = runs.map(run=>run.turns[0]?.sessionSha256).filter(Boolean);
    assert.equal(new Set(initialThreads).size,initialThreads.length,'initial sessions must be independent');
    log({event:'completed',findings:runs.length,writeAttempts:0});
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
