'use strict';
// Actual Unix HTTP and durable-recorder faults with modeled Engine/admission/timers.
// These controls never contact Docker, start SDK/model work or grant admission.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test');
const {withEngineFixture}=require('./engine-transport-components.cjs');
const {createDurableRecorder}=require('./attempt-ledger.cjs');
for(const reason of ['cancelled','failed'])for(const recovered of [false,true])for(const escalated of [false,true])
 test('owned stop record fault: '+reason+' recovered='+recovered+' escalated='+escalated+' stops before rejecting the first journal error',async()=>{
  await withEngineFixture({ignoreLifetimeEof:escalated,escalateOnWait:escalated},async f=>{
   const file=path.join(f.directory,'scope-events.jsonl'),durable=createDurableRecorder(file),written=[];let first;
   const record=event=>{try{durable(event);written.push(event);}catch(error){first??=error;if(recovered&&fs.lstatSync(file).isDirectory()){fs.rmdirSync(file);fs.renameSync(file+'.retained',file);}throw error;}};
   const scope=await f.api.createOperationContainment({root:f.directory,identity:f.identity,inputDirectory:f.input,outputDirectory:f.output,record});
   await scope.start();assert.equal(f.running,true);const inspected=f.requests.filter(r=>r.route==='/containers/'+scope.scopeId+'/json').length;
   fs.renameSync(file,file+'.retained');fs.mkdirSync(file);
   await assert.rejects(scope.stop(reason),error=>error===first&&error.code==='EISDIR');
   assert.equal(f.running,false,'journal failure must not prevent the owned lifetime stop');
   assert(f.requests.some(r=>r.route.endsWith('/wait?condition=next-exit')));
   assert(f.requests.findIndex(r=>r.route.endsWith('/wait?condition=next-exit'))<f.requests.findIndex(r=>r.route.endsWith('/start')),'exit observation must register before start');
   assert(f.requests.filter(r=>r.route==='/containers/'+scope.scopeId+'/json').length>=inspected+1,'stop must inspect identity; the pre-registered Engine exit confirms namespace termination');
   assert.equal(f.requests.filter(r=>r.route.includes('/kill?')).length,escalated?1:0);
   assert.equal(written.some(row=>row.event==='scope-stopped'),recovered);
   await f.whenRemoved();assert.equal(f.removed,true,'daemon cleanup must survive a journal failure');
   assert.equal(f.requests.filter(r=>r.method==='DELETE').length,0);
   assert.equal(written.some(row=>row.event==='scope-removed'),false,'physical daemon cleanup is not completed delivery');
  });
 });
for(const reason of ['cancelled','failed'])test('owned stop record fault: '+reason+' before start confirms the created scope without starting it',async()=>{
 await withEngineFixture({},async f=>{
  const file=path.join(f.directory,'scope-events.jsonl'),durable=createDurableRecorder(file);let first;
  const record=event=>{try{durable(event);}catch(error){first??=error;throw error;}};
  const scope=await f.api.createOperationContainment({root:f.directory,identity:f.identity,inputDirectory:f.input,outputDirectory:f.output,record});
  fs.renameSync(file,file+'.retained');fs.mkdirSync(file);
  await assert.rejects(scope.stop(reason),error=>error===first&&error.code==='EISDIR');
  assert.equal(f.running,false);assert.equal(f.removed,false);
  assert.equal(f.requests.filter(r=>r.route==='/containers/'+scope.scopeId+'/json').length,2);
  assert.equal(f.requests.filter(r=>r.route.endsWith('/start')||r.route.includes('/kill?')).length,0);
 });
});
for(const reason of ['cancelled','failed'])test('owned stop record fault: '+reason+' preserves a later confirmation-record error after requesting termination',async()=>{
 await withEngineFixture({recordFailure:'scope-stopped'},async f=>{
  const scope=await f.create();await scope.start();await assert.rejects(scope.stop(reason),/unit durable record failure/);
  assert.equal(f.running,false);await f.whenRemoved();assert.equal(f.removed,true);assert.equal(f.requests.filter(row=>row.method==='DELETE').length,0);assert(f.events.some(row=>row.event==='scope-stop-request'));
 });
});

// Engine metadata/create cancellation must settle before a held response.
for(const phase of ['version','create'])test('ev974-C27 explicit cancellation closes a held '+phase+' reply before it is released',async()=>{
 let release,held;const waiting=new Promise(resolve=>{held=resolve;});
 const options=phase==='version'?{holdVersion:true,onHeldVersion(reply){release=reply;held();}}:{holdCreateReply:true,onHeldCreate(reply){release=reply;held();}};
 await withEngineFixture(options,async f=>{
  const cancel=new AbortController();
  const operation=f.api.runContainedOperation({root:f.directory,plan:f.plan,mode:'native-control',slot:{caseId:'ev974-C32'},outputDirectory:path.join(f.directory,'outer-output'),record:f.record,signal:cancel.signal});
  const observed=operation.then(value=>({kind:'resolved',value}),error=>({kind:'rejected',error}));
  try{
   await waiting;cancel.abort();
   let timer;const terminal=await Promise.race([observed,new Promise(resolve=>{timer=setTimeout(()=>resolve({kind:'pending'}),1000);})]);clearTimeout(timer);
   assert.equal(terminal.kind,'rejected','explicit cancellation must settle before the Engine releases its held reply');
   assert.match(terminal.error.message,/cancelled|aborted/);
   assert.equal(f.activeClientRequests,0);
   assert.equal(f.events.at(-1).event,'operation-incomplete');
   assert.equal(f.events.at(-1).reason,'explicit-cancellation');
   assert.equal(f.events.at(-1).scopeId,null);
   assert.equal(f.events.at(-1).stoppedConfirmed,false);
   assert.equal(f.events.at(-1).removed,false);
   assert.equal(f.requests.filter(r=>r.method==='DELETE'||r.route.endsWith('/start')).length,0);
  }finally{release?.();await observed;}
 });
});
