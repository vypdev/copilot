'use strict';
// Source controller with modeled admission/process ports and actual private FS.
// No SDK child, model, Docker scope or actual42 campaign is executed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const vm=require('node:vm'),{EventEmitter}=require('node:events'),{test}=require('node:test');
const root=path.resolve(__dirname,'../../../..'),ev07=path.join(root,'quality/bugbot/evidence/issue-950/ev07-shadow');
const file=path.join(ev07,'full-review.cjs'),source=fs.readFileSync(file,'utf8');
function fixture(t,point,schemaVersion){
 const campaign=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ev974-full-review-component-')));
 t.after(()=>fs.rmSync(campaign,{recursive:true,force:true}));
 const output=path.join(campaign,'full-review'),ledger=path.join(output,'slots.jsonl');
 const events=new EventEmitter(),selected=JSON.parse(fs.readFileSync(path.join(ev07,'plan.json')));
 selected.schemaVersion=schemaVersion;delete selected.containment;
 let spawned=0,mutated=false; const logDescriptors=[],openDescriptors=new Set();
 t.after(()=>{for(const fd of openDescriptors){try{fs.closeSync(fd);}catch{}}});
 const fault=row=>{
  if(!mutated&&((point==='start'&&row.event==='start')||(point==='planned'&&row.event==='slot-planned')||(point==='slot-start'&&row.event==='slot-start'))){
   mutated=true;if(fs.existsSync(ledger))fs.renameSync(ledger,ledger+'.durable-prefix');fs.mkdirSync(ledger);
  }
 };
 const io={...fs,openSync(target,...rest){const fd=fs.openSync(target,...rest);if(String(target).endsWith('.log')){logDescriptors.push(fd);openDescriptors.add(fd);}return fd;},closeSync(fd){const result=fs.closeSync(fd);openDescriptors.delete(fd);return result;},appendFileSync(target,bytes,...rest){
  if(target===ledger)fault(JSON.parse(bytes));
  return fs.appendFileSync(target,bytes,...rest);
 }};
 const dependencies={
  'node:fs':io,'./configuration.cjs':selected,
  '../execution-provenance.cjs':{requireBootstrapAdmission(){},spawnQualificationDriver(){spawned++;throw Error('No process expected before ledger admission');}},
  './launch-full-review.cjs':{requirePassingCorpus:()=>campaign},
  './implementation.cjs':{qualificationProvenance:()=>({implementation:'a'.repeat(40),componentOnly:true}),selectedPlanProvenance:()=>({sha256:'b'.repeat(64),componentOnly:true})},
  '../../issue974/attempt-ledger.cjs':{createDurableRecorder(file){
   const actual=require(path.join(root,'quality/bugbot/evidence/issue974/attempt-ledger.cjs')).createDurableRecorder(file);
   return row=>{fault(row);return actual(row);};
  }},
 };
 const module={exports:{}},controlledRequire=name=>Object.hasOwn(dependencies,name)?dependencies[name]:name.startsWith('node:')?require(name):(()=>{throw Error('Unplanned full-review dependency '+name);})();
 vm.compileFunction(source,['require','module','__filename','__dirname','process'],{filename:file})(controlledRequire,module,file,ev07,events);
 return{run:()=>module.exports.run(campaign),events,spawns:()=>spawned,ledger,logDescriptors};
}
for(const schemaVersion of [1,2])for(const point of ['start','planned','slot-start'])test('full-review component: real v'+schemaVersion+' '+point+' ledger failure releases listeners and log descriptors before any child',async t=>{
 const f=fixture(t,point,schemaVersion);await assert.rejects(f.run(),{code:'EISDIR'});
 assert.equal(f.spawns(),0);assert.equal(f.events.listenerCount('SIGINT'),0);assert.equal(f.events.listenerCount('SIGTERM'),0);
 if(point==='planned')assert.equal(JSON.parse(fs.readFileSync(f.ledger+'.durable-prefix','utf8')).event,'start');
 if(point==='slot-start'){assert.ok(f.logDescriptors.length>0);for(const fd of f.logDescriptors)assert.throws(()=>fs.fstatSync(fd),{code:'EBADF'});}
});
