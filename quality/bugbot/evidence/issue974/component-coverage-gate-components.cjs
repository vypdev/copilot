'use strict';
// Actual child executions of the published AST drivers with no target execution.
// Only their test-suite import is suppressed, producing real zero-hit maps.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{test}=require('node:test');
const root=path.resolve(__dirname,'../../../..');
const wrappers=['corpus-transport-coverage','engine-transport-coverage','supervisor-transport-coverage','launcher-attempt-coverage','implementation-full-review-coverage','review-driver-coverage'];
for(const name of wrappers)for(const prior of [0,23])test('coverage exit contract: '+name+' rejects below-budget coverage with prior exit '+prior,t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ev974-gate-exit-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const driver=path.join(root,'quality/bugbot/evidence/issue-974/controls',name,'coverage.cjs');
 const suppressed=['quality/bugbot/evidence/issue974/qualification.test.cjs','quality/bugbot/evidence/issue974/review-driver-components.cjs','quality/bugbot/evidence/issue-950/ev07-shadow/review-runtime.test.cjs'].map(file=>path.join(root,file));
 const output=path.join(directory,'coverage'),child=path.join(directory,'no-target-execution.cjs');
 fs.writeFileSync(child,"const Module=require('node:module');const load=Module._load;Module._load=function(request,...args){if("+JSON.stringify(suppressed)+".includes(request))return {};return load.call(this,request,...args);};process.exitCode="+prior+";require("+JSON.stringify(driver)+");\n");
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','SystemRoot','WINDIR','TMPDIR','TEMP','TMP'].includes(key)));env.EV974_COMPONENT_COVERAGE_OUTPUT=output;
 const result=spawnSync(process.execPath,[child],{cwd:root,env,encoding:'utf8'});
 assert.ifError(result.error);assert.equal(result.signal,null);assert.equal(result.status,prior||1,result.stderr+'\n'+result.stdout);
 const receipt=JSON.parse(fs.readFileSync(path.join(output,'receipt.json'),'utf8'));
 assert(receipt.results.length>0);assert(receipt.results.every(row=>row.gate===false&&row.summary.statements.pct===0));
 assert.equal(receipt.globalChangedModuleCoverageSatisfied,false);assert.equal(receipt.qualificationModelCalls,0);
});
