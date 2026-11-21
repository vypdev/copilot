'use strict';
// Actual Unix HTTP fault sequencing with modeled Engine/admission/timers.
// Explicit fixture release never grants native or SDK/model acceptance.
const assert=require('node:assert/strict'),{test}=require('node:test');
const {withEngineFixture}=require('./engine-transport-components.cjs');
const once=fn=>{let used=false;return()=>{if(!used){used=true;fn();}};};
for(const reason of ['cancelled','failed'])test('pending attach cancellation: '+reason+' destroys the owned request before waiting for startup',async()=>{
 let release,observed;const held=new Promise(resolve=>{observed=resolve;});
 await withEngineFixture({holdAttachment:true,onHeldAttachment(fn){release=once(fn);observed();}},async f=>{
  const scope=await f.create(),starting=scope.start().then(()=>({started:true}),error=>({error}));
  await Promise.race([held,starting.then(value=>{if(!release)throw value.error||Error('start returned without held attachment');})]);
  const stopping=scope.stop(reason);void stopping.catch(()=>undefined);
  try{assert(f.attachDestructions>0,'owned pending attach must receive cancellation before stop awaits startup');}
  finally{release();await starting;await stopping;}
  assert.equal(f.requests.filter(row=>row.route.endsWith('/start')).length,0);assert.equal(f.running,false);
  await scope.remove();assert.equal(f.removed,true);
 });
});
for(const reason of ['cancelled','failed'])test('blocked inspection cancellation: '+reason+' ends the owned lifetime before waiting for Engine metadata',async()=>{
 let armed=false,heldOnce=false,release,observed;const held=new Promise(resolve=>{observed=resolve;});
 await withEngineFixture({holdInspection(){if(armed&&!heldOnce){heldOnce=true;return true;}return false;},onHeldInspection(fn){release=once(fn);observed();}},async f=>{
  const scope=await f.create();await scope.start();armed=true;
  const stopping=scope.stop(reason);void stopping.catch(()=>undefined);await held;
  try{assert(f.lifetimeEnds>0,'owned lifetime must receive termination while Engine inspection remains blocked');}
  finally{release();await stopping;}
  assert.equal(f.running,false);await scope.remove();assert.equal(f.removed,true);
 });
});
