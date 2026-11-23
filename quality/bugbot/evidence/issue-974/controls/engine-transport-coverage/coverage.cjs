'use strict';
// Component test instrumentation only. Never import this from qualification/native execution.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Module=require('node:module'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../../../../../..');
assert(process.env.EV974_COMPONENT_COVERAGE_OUTPUT,'Pass a fresh private output directory in EV974_COMPONENT_COVERAGE_OUTPUT');
const output=path.resolve(process.env.EV974_COMPONENT_COVERAGE_OUTPUT);fs.mkdirSync(output,{mode:0o700});
assert(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH);const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const installed=path.join(root,'node_modules/.pnpm'),versions=fs.readdirSync(installed).filter(n=>n.startsWith('istanbul-lib-instrument@'));assert.equal(versions.length,1);
const {createInstrumenter}=require(path.join(installed,versions[0],'node_modules/istanbul-lib-instrument'));
const {createCoverageMap}=require(path.join(installed,'istanbul-lib-coverage@3.2.2/node_modules/istanbul-lib-coverage'));
const relatives=['quality/bugbot/evidence/issue974/operation-containment.cjs','quality/bugbot/evidence/issue974/qualification-seccomp.cjs'];
const testFiles=["sdk-runtime-admission-components.cjs", "managed-requirements-components.cjs", "seccomp-components.cjs", "worker-scratch-components.cjs", "qualification.test.cjs", "engine-transport-components.cjs", "supervisor-components.cjs", "corpus-collector-components.cjs", "corpus-worker-components.cjs", "launcher-components.cjs", "attempt-components.cjs", "implementation-components.cjs", "full-review-fault-components.cjs", "full-review-lifecycle-components.cjs", "review-driver-components.cjs", "component-coverage-gate-components.cjs", "stop-record-components.cjs", "startup-stop-components.cjs", "attempt-durability-components.cjs", "component-evidence-integrity-components.cjs", "late-cancellation-components.cjs", "native-bootstrap-components.cjs", "owner-loss-components.cjs", "containment-native.test.cjs"].map(name=>path.join(root,'quality/bugbot/evidence/issue974',name));
const testSha256=Object.fromEntries(testFiles.map(file=>[path.relative(root,file),sha(fs.readFileSync(file))]));
const targets=new Map(),urls=new Map();globalThis.__coverage__={};
for(const relative of relatives){const file=path.join(root,relative),raw=fs.readFileSync(file,'utf8'),instrumenter=createInstrumenter({coverageVariable:'__coverage__',produceSourceMap:false});const instrumented=instrumenter.instrumentSync(raw,file);const record={file,relative,raw,sourceSha256:sha(raw),instrumented,initial:instrumenter.lastFileCoverage()};targets.set(file,record);urls.set(pathToFileURL(file).href,record);globalThis.__coverage__[file]=record.initial;}
const observations=[];function check(record){assert.equal(sha(fs.readFileSync(record.file)),record.sourceSha256,'production source changed during component coverage');}
Module.registerHooks({load(url,context,next){const result=next(url,context),record=urls.get(url);if(!record)return result;check(record);observations.push({kind:'module-load',relative:record.relative});return {...result,source:record.instrumented};}});
const compile=Module.prototype._compile;Module.prototype._compile=function(source,file){const record=targets.get(file);if(record&&sha(source)===record.sourceSha256){check(record);observations.push({kind:'component-compile',relative:record.relative});return compile.call(this,record.instrumented,file);}return compile.call(this,source,file);};
const run=vm.runInNewContext;vm.runInNewContext=function(source,context,options){
 if(typeof source==='string')for(const record of targets.values()){
  if(source===record.raw||source.startsWith(record.raw+'\nmodule.exports')){
   check(record);const suffix=source.slice(record.raw.length);assert(!suffix||suffix==='\nmodule.exports.testCliBytes=admitCliBytes;'||suffix==='\nmodule.exports.testWait = registerWait;\n'||suffix==='\nmodule.exports.testAttach = attachLifetime;\n');observations.push({kind:'component-vm',relative:record.relative,testOnlyExportSuffix:!!suffix});
   return run.call(this,record.instrumented+suffix,{...context,__coverage__:globalThis.__coverage__},{...(typeof options==='object'?options:{}),filename:record.file});
  }
 }
 return run.call(this,source,context,options);
};
process.on('exit',()=>{
 for(const [file,digest] of Object.entries(testSha256))assert.equal(sha(fs.readFileSync(path.join(root,file))),digest,'test bytes changed after pre-load capture');
 const map=createCoverageMap(globalThis.__coverage__),results=[];let gate=true;
 for(const record of targets.values()){
  check(record);const summary=map.fileCoverageFor(record.file).toSummary().toJSON();const passed=summary.statements.pct>=95&&summary.lines.pct>=95&&summary.branches.pct>=90&&summary.functions.pct>=90;gate&&=passed;results.push({file:record.relative,sourceSha256:record.sourceSha256,summary,gate:passed});
 }
 if(!gate&&!process.exitCode)process.exitCode=1;
 fs.writeFileSync(path.join(output,'coverage-final.json'),JSON.stringify(map.toJSON()),{mode:0o600});fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify({schemaVersion:1,kind:'exact-source AST engine component coverage through repository C27 and actual local Unix HTTP fixtures; no native Docker/model acceptance',results,measuredEngineComponentGateSatisfied:gate,globalChangedModuleCoverageSatisfied:false,observations,testSha256,qualificationModelCalls:0,nativeSdkAcceptance:false,production:'disabled'},null,2)+'\n',{mode:0o600});
 console.log('ALL_CJS_COMPONENT_COVERAGE',JSON.stringify(results.map(r=>({file:r.file,statements:r.summary.statements.pct,lines:r.summary.lines.pct,branches:r.summary.branches.pct,functions:r.summary.functions.pct,gate:r.gate}))));
});
require(path.join(root,'quality/bugbot/evidence/issue974/qualification.test.cjs'));
