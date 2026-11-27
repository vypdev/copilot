'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events'),Module=require('node:module'),{test}=require('node:test');
const root='/private/tmp/copilot-goal-974',file=path.join(root,'src/infrastructure/bugbot/shadow/session.cjs');
const installation=path.join(root,'node_modules/.pnpm');const version=fs.readdirSync(installation).find(n=>n.startsWith('istanbul-lib-instrument@'));
const {createInstrumenter}=require(path.join(installation,version,'node_modules/istanbul-lib-instrument'));
const instrumented=createInstrumenter({coverageVariable:'__coverage__',produceSourceMap:false}).instrumentSync(fs.readFileSync(file,'utf8'),file);
const thread='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
function session(){
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();
 const state={kills:[],timers:[],cleared:[],spawn:null,prompt:null};child.stdout.setEncoding=value=>assert.equal(value,'utf8');child.stdin.end=value=>state.prompt=value;child.kill=signal=>{state.kills.push(signal);return true;};
 const nativeRequire=Module.createRequire(file),module=new Module(file);module.filename=file;module.paths=Module._nodeModulePaths(path.dirname(file));
 module.require=name=>name==='node:child_process'?{spawn:(...args)=>{state.spawn=args;return child;}}:name==='node:timers'?{setTimeout:(callback,delay)=>{assert.equal(delay,1600);const timer={callback};state.timers.push(timer);return timer;},clearTimeout:timer=>state.cleared.push(timer)}:nativeRequire(name);
 module._compile(instrumented,file);return {api:module.exports,child,state};
}
function event(child,value,newline=true){child.stdout.emit('data',JSON.stringify(value)+(newline?'\n':''));}
function completed(child,{actual=thread,model='reported-model',usage={input_tokens:7},text='{"ok":true}',tail=false}={}){
 event(child,{type:'thread.started',thread_id:actual});event(child,{type:'turn.started'});event(child,{type:'item.completed',item:{type:'agent_message',text}});event(child,{type:'turn.completed',model,usage},!tail);
}
async function execute({options={},produce=completed,expected=null,check=()=>{}}={}){
 const fixture=session(),cwd=fs.mkdtempSync(path.join(os.tmpdir(),'ev974-session-transport-'));fs.chmodSync(cwd,0o700);
 const configuration={provider:'codex',model:'gpt-6.1-sol',modelProvider:'openai',effort:'xhigh'};
 try{
  const operation=fixture.api.ask({cwd,prompt:'private component prompt',schema:{type:'object'},configuration,...options});
  await produce(fixture.child,fixture.state);fixture.child.emit('close',0);const result=await operation;
  assert.equal(result.fact.failure,expected);assert.equal(fixture.state.prompt,'private component prompt');check(result,fixture.state,cwd);return result;
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
}
test('session transport preserves provider outcomes, termination fences and invocation evidence under faults',async()=>{
 await execute({check:(r,s,cwd)=>{assert.deepEqual(r.response,{ok:true});assert.equal(r.fact.reportedModel,'reported-model');assert.equal(r.fact.usageScope,'session-cumulative');assert(s.spawn[1].includes('--ignore-user-config'));assert.equal(fs.statSync(path.join(cwd,'schema.json')).mode&0o777,0o600);}});
 await execute({options:{threadId:thread},check:(r,s)=>{assert.deepEqual(s.spawn[1].slice(0,2),['exec','resume']);assert.equal(r.threadId,thread);}});
 await execute({options:{configuration:{provider:'codex',model:'gpt-6.1-sol'}},produce:child=>completed(child,{model:'bad model',usage:null,tail:true}),check:r=>{assert.equal(r.fact.invocation.modelProvider,'openai');assert.equal(r.fact.invocation.reasoningEffort,undefined);assert(!Object.hasOwn(r.fact,'reportedModel'));assert(!Object.hasOwn(r.fact,'usage'));}});
 await execute({options:{runtime:{executable:'/reviewed/codex',prefixArgs:['prefix'],environment:{ONLY:'private'}}},check:(r,s)=>{assert.equal(s.spawn[0],'/reviewed/codex');assert.equal(s.spawn[1][0],'prefix');assert.deepEqual(s.spawn[2].env,{ONLY:'private'});}});
 await execute({produce:child=>{child.stdout.emit('data','malformed-json\n');event(child,{type:'irrelevant'});event(child,{type:'item.started',item:{type:'reasoning'}});event(child,{type:'item.updated',item:{type:'agent_message',text:'partial'}});child.stdin.emit('error',new Error('EPIPE'));completed(child);}});
 for(const type of ['item.started','item.updated','item.completed'])await execute({produce:child=>{event(child,{type,item:{type:'command_execution'}});},expected:'unexpected-provider-tool',check:(r,s)=>assert.deepEqual(s.kills,['SIGKILL'])});
 const notice='Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.';
 await execute({produce:child=>{event(child,{type:'item.completed',item:{type:'error',message:notice}});completed(child);}});
 await execute({produce:child=>{event(child,{type:'turn.started'});event(child,{type:'item.completed',item:{type:'error',message:notice}});},expected:'unexpected-provider-tool'});
 for(const [error,expected]of [[{code:'cy'},'provider-safety-stop'],[{codex_error_info:'content_filter'},'provider-safety-stop'],[{code:'context_length_exceeded'},'provider-context-window'],[{message:'ordinary provider failure'},'provider-turn-failed']])await execute({produce:child=>event(child,{type:'turn.failed',error}),expected});
 await execute({produce:child=>{event(child,{type:'turn.failed',error:{message:'ordinary'}});event(child,{type:'turn.failed',error:{code:'content_filter'}});},expected:'provider-safety-stop'});
 await execute({produce:child=>{child.emit('error',new Error('ENOENT'));},expected:'provider-launch'});
 await execute({produce:child=>{child.stderr.emit('data','flagged for possible cybersecurity risk');},expected:'provider-safety-stop'});
 await execute({produce:child=>{event(child,{type:'turn.failed',error:{message:'ordinary'}});child.stderr.emit('data','context_length_exceeded');},expected:'provider-context-window'});
 await execute({produce:child=>{},expected:'provider-session-mismatch',check:r=>assert.equal(r.fact.sessionSha256,null)});
 await execute({options:{threadId:thread},produce:child=>completed(child,{actual:other}),expected:'provider-session-mismatch'});
 for(const [stderr,expected]of [['unexpected argument --obsolete','provider-cli-arguments'],['ordinary incomplete','provider-incomplete']])await execute({produce:child=>{event(child,{type:'thread.started',thread_id:thread});child.stderr.emit('data',stderr);},expected});
 await execute({produce:child=>{completed(child);event(child,{type:'turn.completed'});},expected:'provider-incomplete'});
 await execute({produce:child=>completed(child,{text:'invalid-json'}),expected:'provider-json-invalid'});
 for(const throws of [false,true]){
  const controller=new AbortController(),reasons=[];
  await execute({options:{signal:controller.signal,runtime:{onTermination:code=>{reasons.push(code);if(throws)throw Error('evidence unavailable');}}},produce:child=>{controller.abort();child.stderr.emit('data','flagged for possible cybersecurity risk');},expected:throws?'provider-safety-stop':'investigation-canceled',check:(r,s)=>{assert.deepEqual(reasons,['investigation-canceled']);assert.deepEqual(s.kills,['SIGKILL']);}});
 }
 const already=new AbortController();already.abort();await execute({options:{signal:already.signal},produce:()=>{},expected:'investigation-canceled'});
 await execute({options:{runtime:{onTermination:()=>{throw Error('lost evidence');}}},produce:child=>event(child,{type:'item.completed',item:{type:'tool'}}),expected:'provider-evidence-unavailable'});
 for(const managed of [false,true]){
  const reasons=[];await execute({options:managed?{runtime:{onTermination:code=>reasons.push(code)}}:{},produce:(child,state)=>{completed(child);assert.equal(state.timers.length,1);state.timers[0].callback();},expected:managed?'provider-cli-exit-unconfirmed':null,check:(r,s)=>{assert.deepEqual(s.kills,['SIGKILL']);assert.deepEqual(reasons,managed?['provider-cli-exit-unconfirmed']:[]);}});
 }
 await execute({produce:child=>child.stdout.emit('data','x'.repeat(2_000_001)),expected:'provider-stream-budget'});
 const {api}=session();assert.equal(api.isContextFailure('context_length_exceeded'),true);assert.equal(api.providerFailure({codexErrorInfo:'contextWindowExceeded'}),'provider-context-window');assert.equal(api.codexInvocation(['--model','ordinary','--sandbox','read-only']).model,'ordinary');
 assert.deepEqual(api.codexInvocation(['--config','model="selected"','-c','sandbox_mode="read-only"']),{model:'selected',modelProvider:undefined,reasoningEffort:undefined,sandbox:'read-only'});
});
