'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ask } = require('./run-pilot.cjs');
const schema = { type:'object', additionalProperties:false, required:['reply'], properties:{reply:{type:'string'}} };
const request = { agentId:'adapter-fixture', configuration:{provider:'codex', modelProvider:'openai', model:'gpt-6-luna', effort:'low'},
    options:{schema}, prompt:'Synthetic adapter boundary check' };

async function fakeProvider(body, run) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(),'bugbot-v4-test-'));
    const binary = path.join(scratch,'fake-codex');
    const previous = process.env.BUGBOT_PILOT_CODEX;
    fs.writeFileSync(binary,`#!${process.execPath}\nconst event = e => console.log(JSON.stringify(e));\n${body}\n`, {mode:0o700});
    process.env.BUGBOT_PILOT_CODEX = binary;
    try { await run(scratch); }
    finally {
        if (previous === undefined) delete process.env.BUGBOT_PILOT_CODEX;
        else process.env.BUGBOT_PILOT_CODEX = previous;
        fs.rmSync(scratch,{recursive:true,force:true});
    }
}

const completed = `event({type:'item.completed',item:{type:'agent_message',text:'{"reply":"OK"}'}});
event({type:'turn.completed',usage:{input_tokens:7,output_tokens:3}});`;

test('returns a valid completed turn when the CLI lingers during shutdown', async () => {
    await fakeProvider(`${completed}\nsetInterval(()=>{},100);`, async dir => {
        const {response,fact} = await ask(request,'closed',dir,6000);
        assert.equal(response.reply,'OK');
        assert.equal(fact.turnCompletions,1);
        assert.equal(fact.usage.input_tokens,7);
        assert(fact.wallMs < 5000);
    });
});

test('records a started turn that expires without synthesizing usage or a verdict', async () => {
    await fakeProvider(`event({type:'turn.started'});\nsetInterval(()=>{},100);`, async dir => {
        await assert.rejects(ask(request,'closed',dir,250), error => error.message==='provider-turn-timeout'
            && error.fact.turnStartedMs!==null && error.fact.turnCompletions===0 && error.fact.usage===null);
    });
});

test('rejects a tool event even when a structured terminal verdict is available', async () => {
    await fakeProvider(`event({type:'item.completed',item:{type:'command_execution'}});\n${completed}`, async dir => {
        await assert.rejects(ask(request,'closed',dir,3000), error => error.message==='closed-session-tool-event'
            && error.fact.toolTypes.includes('command_execution'));
    });
});
