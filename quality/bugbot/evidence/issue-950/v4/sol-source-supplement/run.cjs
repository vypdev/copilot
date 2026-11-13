'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ask } = require('../run-pilot.cjs');
const { anchorFinding, decide, diffExcerpt, digest, limits, remainingVerifierBudget, retryDeadline, verifierRequest } = require('../verification.cjs');
const sdk = process.env.BUGBOT_PILOT_SDK || path.resolve(__dirname,'../../../../../..');
const { renderUntrustedContentVerbatim } = require(path.join(sdk,'src/domain/security/untrusted_content'));
const read = filename => JSON.parse(fs.readFileSync(path.join(__dirname,filename),'utf8'));
const git = (cwd,...args) => execFileSync('git',['-C',cwd,...args],{encoding:'utf8',maxBuffer:4*1024*1024});
const bindings = read('../subjects.lock.json');
const candidates = read('../candidates.json');
const packets = read('../evidence.json');
const more = read('receipts.json');
const render = (value,origin) => renderUntrustedContentVerbatim({text:value,origin,originalLength:value.length,truncated:false,removedControlCharacters:false});
const config = {provider:'codex',modelProvider:'openai',model:'gpt-6.1-sol',effort:'low'};
const clock = () => Math.round(performance.now());

function scenario(root, subject) {
    const cwd = path.resolve(root,subject);
    const b = bindings[subject];
    assert.equal(git(cwd,'rev-parse','HEAD').trim(),b.head);
    assert.equal(git(cwd,'rev-parse','HEAD^{tree}').trim(),b.tree);
    assert.equal(git(cwd,'status','--porcelain'),'');
    assert.equal(git(cwd,'remote'),'');
    const args = ['-c','core.quotePath=true','diff','--no-ext-diff','--no-textconv','--no-renames','--unified=3',b.base,b.head,'--'];
    assert.equal(digest(git(cwd,...args,...b.paths)),b.diffSha256);
    const source = candidates[subject][0];
    const patch = git(cwd,...args,source.path);
    const changes = [{filename:source.path,patch:patch.slice(patch.indexOf('@@ '))}];
    const finding = {id:source.id,file:source.path,line:source.line,title:source.impact,
        description:source.trigger+' '+source.pathToEffect,evidence:source.pathToEffect};
    const anchor = anchorFinding(finding,changes);
    assert(anchor);
    const diff = diffExcerpt(finding,changes);
    assert(diff);
    for (const receipt of more[subject]) {
        assert.equal(receipt.head,b.head);
        const locator = `${b.head}:${receipt.path}`;
        assert.equal(git(cwd,'rev-parse',locator).trim(),receipt.blob);
        assert.equal(git(cwd,'show',locator).split(/\r?\n/u).slice(receipt.start-1,receipt.end).join('\n'),receipt.text);
    }
    const selected = {...finding,line:anchor.line};
    const receipts = [...packets[subject],...more[subject]];
    assert(receipts.length <= 8);
    return {cwd,finding,anchor,receipts,prior:verifierRequest(config,selected,diff,packets[subject],render),
        next:verifierRequest(config,selected,diff,receipts,render)};
}

async function trial(row, fixture) {
    const calls = [];
    const start = clock();
    const request = async ms => {
        try {
            const result = await ask(fixture.next,'closed',fixture.cwd,ms);
            calls.push(result.fact);
            return result.response;
        } catch(error) {
            if (error.fact) calls.push(error.fact);
            throw error;
        }
    };
    try {
        let response;
        try { response = await request(limits.callWallMs); }
        catch(error) {
            const left = retryDeadline(error.fact,calls,clock()-start);
            if (!left) throw error;
            response = await request(left);
        }
        remainingVerifierBudget(calls,clock()-start);
        assert(clock()-start <= limits.subjectWallMs);
        const {reason: _private, ...decision} = decide(response,fixture.finding.id,fixture.receipts);
        return {...row,status:'completed',anchor:fixture.anchor,decision,calls};
    } catch(error) {
        const reason = /^[a-z][a-z0-9-]{2,70}$/u.test(error.message) ? error.message : 'supplement-contract-failed';
        return {...row,status:calls.some(c=>c.usage)?'failed':'aborted',reason,calls};
    }
}

async function main() {
    const [root,originalLedger,output] = process.argv.slice(2);
    const scenarios = Object.fromEntries(Object.keys(more).map(id=>[id,scenario(root,id)]));
    const original = fs.readFileSync(originalLedger,'utf8').trim().split('\n').map(JSON.parse)
        .filter(r=>r.phase==='frozen-replay'&&r.model===config.model&&r.variant==='application-evidence'&&scenarios[r.subject]);
    assert.equal(original.length,18);
    for (const row of original) {
        const calls = row.calls.filter(c=>c.role==='pilot-v4-verifier');
        assert(calls.length,`prior packet was not sent for ${row.subject}/${row.repetition}`);
        assert(calls.every(c=>c.promptSha256===digest(scenarios[row.subject].prior.prompt)),`prior prompt mismatch for ${row.subject}/${row.repetition}`);
    }
    if (!output) { console.log('18 original prompt hashes reproduced.'); return; }
    assert(!fs.existsSync(output));
    const plan = original.map(r=>({trial:digest('sol-supplement/'+r.trial).slice(0,16),prior:r.trial,
        subject:r.subject,repetition:r.repetition,model:r.model})).sort((a,b)=>a.trial.localeCompare(b.trial));
    const worker = async () => {
        let row;
        while ((row=plan.shift())) {
            const result=await trial(row,scenarios[row.subject]);
            fs.appendFileSync(output,JSON.stringify(result)+'\n',{mode:0o600});
            console.log(result.subject,result.repetition,result.status,result.decision?.verdict??result.reason);
        }
    };
    await Promise.all(Array.from({length:3},worker));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
