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
   assert(f.requests.some(r=>r.route.endsWith('/wait?condition=not-running')));
   assert(f.requests.filter(r=>r.route==='/containers/'+scope.scopeId+'/json').length>=inspected+2,'stop must inspect identity and confirm actual stopped state');
   assert.equal(f.requests.filter(r=>r.route.includes('/kill?')).length,escalated?1:0);
   assert.equal(written.some(row=>row.event==='scope-stopped'),recovered);
   assert.equal(f.removed,false,'journal failure cannot become completed delivery or unproved cleanup');
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
  assert.equal(f.running,false);assert.equal(f.removed,false);assert(f.events.some(row=>row.event==='scope-stop-request'));
 });
});
