'use strict';
// Actual controller, private files and durable journals; explicitly modeled
// admission/provenance and child/scope ports. No native SDK or model execution.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const vm=require('node:vm'),{EventEmitter}=require('node:events'),{test}=require('node:test');
const root=path.resolve(__dirname,'../../../..'),ev07=path.join(root,'quality/bugbot/evidence/issue-950/ev07-shadow');
const file=path.join(ev07,'full-review.cjs'),source=fs.readFileSync(file,'utf8');
function fixture(t,options={}){
 const campaign=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ev974-controller-lifecycle-')));
 t.after(()=>fs.rmSync(campaign,{recursive:true,force:true}));
 const plan=JSON.parse(fs.readFileSync(path.join(ev07,'plan.json')));plan.schemaVersion=options.contained?2:1;
 if(options.contained)plan.containment={componentOnly:true};else delete plan.containment;
 const slots=Array.from({length:plan.repositoryCohort.repetitions},(_,n)=>plan.repositoryCohort.order.map(id=>({id,repetition:n+1}))).flat();
 const events=new EventEmitter(),spawns=[],scopes=[],killed=[],fds=[],signals=[];let live=0,maxLive=0;
 const score=path.join(campaign,'corpus-v3/corpus-score.json');
 const block=()=>{fs.mkdirSync(path.dirname(score),{recursive:true});fs.writeFileSync(score,JSON.stringify({passed:false}));};
 if(options.blocked)block();
 const once=events.once.bind(events);events.once=(name,fn)=>{once(name,fn);if(options.cancelBefore&&name==='SIGTERM')events.emit(name);return events;};
 const remove=events.removeListener.bind(events);events.removeListener=(name,fn)=>{if(fn.name==='cancel')assert.equal(live,0,'listeners retained until every modeled child/scope settles');return remove(name,fn);};
 const io={...fs,openSync(target,...args){const fd=fs.openSync(target,...args);if(String(target).endsWith('.log'))fds.push(fd);return fd;}};
 const provenance={implementation:'a'.repeat(40),componentOnly:true};
 const dependencies={
  'node:fs':io,'./configuration.cjs':plan,
  '../execution-provenance.cjs':{requireBootstrapAdmission(){},spawnQualificationDriver(mode,args,settings){
   const child=new EventEmitter(),ordinal=spawns.length;live++;maxLive=Math.max(maxLive,live);spawns.push({mode,args,settings});
   let done=false;const close=()=>{if(done)return;done=true;live--;if(options.legacy==='error-code')child.emit('error',{code:'EPIPE'});else if(options.legacy==='error-name')child.emit('error',{name:'ControlledChildError'});else child.emit('close',options.legacy==='nonzero'?7:0,options.legacy==='signal'?'SIGABRT':null);};
   child.kill=signal=>{killed.push(signal);queueMicrotask(close);return true;};
   queueMicrotask(()=>{if(options.blockAfterFirst&&ordinal===0)block();if(options.cancel&&ordinal===0){signals.push(options.cancel);events.emit(options.cancel);}close();});return child;
  }},
  './launch-full-review.cjs':{requirePassingCorpus:()=>campaign},
  './implementation.cjs':{qualificationProvenance:()=>provenance,selectedPlanProvenance:()=>({sha256:'b'.repeat(64),componentOnly:true})},
  '../../issue974/attempt-ledger.cjs':{createDurableRecorder(target){
   const actual=require(path.join(root,'quality/bugbot/evidence/issue974/attempt-ledger.cjs')).createDurableRecorder(target);
   return row=>{if(options.sidecarFault&&String(target).endsWith('.scopes.jsonl')&&row.event==='scope-stopped'){fs.renameSync(target,target+'.prefix');fs.mkdirSync(target);}return actual(row);};
  }},
  '../../issue974/operation-containment.cjs':{async runContainedOperation(request){
   const ordinal=scopes.length;scopes.push(request);live++;maxLive=Math.max(maxLive,live);
   try{
    fs.mkdirSync(request.outputDirectory);const inner=path.join(request.outputDirectory,'review.jsonl');
    if(!options.emptyInner)fs.writeFileSync(inner,JSON.stringify({componentFixture:true,slot:request.slot})+'\n',{mode:0o600});
    for(const suffix of options.emptyInner?[]:['.attempts','.verifier-attempts']){fs.mkdirSync(inner+suffix);fs.writeFileSync(path.join(inner+suffix,'request.json'),'fixture-only');}
    await request.record({event:'scope-created',scopeId:'controlled-'+ordinal});
    if(options.cancel&&ordinal===0){signals.push(options.cancel);events.emit(options.cancel);}
    if(options.scopeError==='unconfirmed')throw Error('private-unpublished-provider-error');
    await request.record({event:'scope-stopped',namespaceInitStopped:true});
    if(options.copyFault&&ordinal===0)fs.writeFileSync(path.join(campaign,'full-review',slots[0].id+'-'+slots[0].repetition+'.jsonl'),'existing evidence');
    if(options.scopeError==='confirmed')throw Error('private-unpublished-provider-error');
    return {exitCode:0,interrupted:request.signal.aborted,namespaceInitStopped:true};
   }finally{live--;}
  }},
 };
 const module={exports:{}},controlledRequire=name=>Object.hasOwn(dependencies,name)?dependencies[name]:name.startsWith('node:')?require(name):(()=>{throw Error('Unexpected component dependency '+name);})();
 vm.compileFunction(source,['require','module','__filename','__dirname','process'],{filename:file})(controlledRequire,module,file,ev07,events);
 const rows=()=>fs.readFileSync(path.join(campaign,'full-review/slots.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const clean=()=>{assert.equal(events.listenerCount('SIGINT'),0);assert.equal(events.listenerCount('SIGTERM'),0);assert.equal(live,0);for(const fd of fds)assert.throws(()=>fs.fstatSync(fd),{code:'EBADF'});};
 return{run:()=>module.exports.run(campaign),rows,clean,spawns,scopes,killed,signals,slots,campaign,maxLive:()=>maxLive};
}
test('full-review lifecycle: all42 ordered legacy slots use exact dispatch identities and private logs',async t=>{
 const f=fixture(t);assert.equal(await f.run(),0);f.clean();assert.equal(f.spawns.length,42);assert.equal(f.maxLive(),3);
 const rows=f.rows();assert.equal(rows.filter(r=>r.event==='slot-planned').length,42);assert.equal(rows.filter(r=>r.event==='slot-finish').length,42);
 for(const [n,call]of f.spawns.entries()){const slot=f.slots[n];assert.equal(call.mode,'review');assert.deepEqual(call.args,[path.join(f.campaign,'fixtures/full-review',slot.id),slot.id,String(slot.repetition),path.join(f.campaign,'full-review',slot.id+'-'+slot.repetition+'.jsonl')]);assert.equal(call.settings.stdio[0],'ignore');assert.equal(call.settings.stdio[1],call.settings.stdio[2]);}
 assert.deepEqual(rows.at(-1),{event:'finish',admitted:42,unstarted:0,interrupted:false,failed:false});
});
for(const legacy of ['nonzero','signal','error-code','error-name'])test('full-review lifecycle: legacy '+legacy+' is retained as failure without claiming qualification',async t=>{
 const f=fixture(t,{legacy});assert.equal(await f.run(),1);f.clean();assert.equal(f.spawns.length,42);const rows=f.rows(),exit=rows.find(r=>r.event==='slot-finish').exit;
 if(legacy==='nonzero')assert.equal(exit.code,7);else if(legacy==='signal')assert.equal(exit.signal,'SIGABRT');else assert.equal(exit.error,legacy==='error-code'?'EPIPE':'ControlledChildError');assert.equal(rows.at(-1).failed,true);
});
for(const cancel of ['SIGINT','SIGTERM'])test('full-review lifecycle: '+cancel+' reaches every active legacy child and leaves unstarted reasons',async t=>{
 const f=fixture(t,{cancel});assert.equal(await f.run(),130);f.clean();assert.equal(f.spawns.length,3);assert.deepEqual(f.killed,['SIGTERM','SIGTERM','SIGTERM']);assert.equal(f.rows().filter(r=>r.event==='not-started'&&r.reason==='explicit-cancellation').length,39);
});
test('full-review lifecycle: cancellation before dispatch records42 unstarted slots and no child',async t=>{
 const f=fixture(t,{cancelBefore:true});assert.equal(await f.run(),130);f.clean();assert.equal(f.spawns.length,0);assert.equal(f.rows().filter(r=>r.event==='not-started'&&r.reason==='explicit-cancellation').length,42);
});
for(const blocked of ['before','during'])test('full-review lifecycle: independent corpus failure '+blocked+' dispatch prevents remaining slots',async t=>{
 const f=fixture(t,blocked==='before'?{blocked:true}:{blockAfterFirst:true});await f.run();f.clean();assert.equal(f.spawns.length,blocked==='before'?0:3);const rows=f.rows();assert.equal(rows.filter(r=>r.event==='not-started'&&r.reason==='independent-corpus-gate-failed').length,42-f.spawns.length);assert.equal(rows.at(-1).unstarted,42-f.spawns.length);
});
test('full-review lifecycle: contained completion copies review and both attempt trees only after confirmed stop',async t=>{
 const f=fixture(t,{contained:true});assert.equal(await f.run(),0);f.clean();assert.equal(f.scopes.length,42);assert.equal(f.spawns.length,0);assert.equal(f.maxLive(),3);
 for(const slot of f.slots){const output=path.join(f.campaign,'full-review',slot.id+'-'+slot.repetition+'.jsonl');assert.deepEqual(JSON.parse(fs.readFileSync(output)),{componentFixture:true,slot:{subjectId:slot.id,repetition:slot.repetition}});for(const suffix of ['.attempts','.verifier-attempts'])assert.equal(fs.readFileSync(path.join(output+suffix,'request.json'),'utf8'),'fixture-only');const sidecar=fs.readFileSync(output+'.scopes.jsonl','utf8').trim().split('\n').map(JSON.parse);assert.equal(sidecar.at(-1).namespaceInitStopped,true);}
});
for(const scopeError of ['unconfirmed','confirmed'])test('full-review lifecycle: '+scopeError+' scope failure retains bounded status and gates evidence copy',async t=>{
 const f=fixture(t,{contained:true,scopeError});assert.equal(await f.run(),1);f.clean();assert.equal(f.scopes.length,3);const rows=f.rows(),finishes=rows.filter(r=>r.event==='slot-finish');assert.equal(finishes.length,3);for(const row of finishes){assert.equal(row.exit.error,scopeError==='confirmed'?'contained-operation-failed':'owned-scope-unconfirmed');assert.equal(row.exit.namespaceInitStopped,scopeError==='confirmed');const output=path.join(f.campaign,'full-review',row.id+'-'+row.repetition+'.jsonl');assert.equal(fs.existsSync(output),scopeError==='confirmed');}assert.equal(rows.filter(r=>r.event==='not-started'&&r.reason==='operation-or-evidence-failed').length,39);assert(!JSON.stringify(rows).includes('private-unpublished-provider-error'));
});
test('full-review lifecycle: contained cancellation settles all scopes and retains130 outcomes before listener cleanup',async t=>{
 const f=fixture(t,{contained:true,cancel:'SIGTERM'});assert.equal(await f.run(),130);f.clean();assert.equal(f.scopes.length,3);assert(f.scopes.every(r=>r.signal.aborted));assert(f.rows().filter(r=>r.event==='slot-finish').every(r=>r.exit.code===130));
});
test('full-review lifecycle: exclusive copy failure settles sibling scopes and retains original destination bytes',async t=>{
 const f=fixture(t,{contained:true,copyFault:true});assert.equal(await f.run(),1);f.clean();assert.equal(f.maxLive(),3);assert(f.scopes.length<42);assert(f.scopes.every(r=>r.signal.aborted));assert.equal(fs.readFileSync(path.join(f.campaign,'full-review',f.slots[0].id+'-1.jsonl'),'utf8'),'existing evidence');assert(f.rows().some(r=>r.event==='collector-failure'&&r.reason==='EEXIST'));assert.equal(f.rows().at(-1).failed,true);
});
test('full-review lifecycle: actual sidecar write failure never publishes unconfirmed review evidence',async t=>{
 const f=fixture(t,{contained:true,sidecarFault:true});assert.equal(await f.run(),1);f.clean();assert.equal(f.scopes.length,3);for(const row of f.rows().filter(r=>r.event==='slot-finish')){assert.equal(row.exit.error,'owned-scope-unconfirmed');assert(!fs.existsSync(path.join(f.campaign,'full-review',row.id+'-'+row.repetition+'.jsonl')));}
});

test('full-review lifecycle: direct entry guard rejects before any dependency or process port',()=>{
 const module={exports:{}},guardedRequire=()=>{throw Error('Dependencies must remain unobserved');};guardedRequire.main=module;
 assert.throws(()=>vm.compileFunction(source,['require','module','__filename','__dirname','process'],{filename:file})(guardedRequire,module,file,ev07,new EventEmitter()),/independently reviewed immutable bootstrap/);
});
test('full-review lifecycle: confirmed empty scope never invents review or attempt artifacts',async t=>{
 const f=fixture(t,{contained:true,emptyInner:true});await f.run();f.clean();for(const slot of f.slots){const out=path.join(f.campaign,'full-review',slot.id+'-'+slot.repetition+'.jsonl');for(const suffix of ['', '.attempts','.verifier-attempts'])assert(!fs.existsSync(out+suffix));}
});
