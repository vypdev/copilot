'use strict';
// Coverage-only component harness. Never load this from a qualification bootstrap.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Module=require('node:module'),{pathToFileURL}=require('node:url');
const root=fs.realpathSync(process.argv[2]),output=process.argv[3];
assert.equal(root,process.cwd());assert(path.isAbsolute(output));fs.mkdirSync(output,{mode:0o700});
assert(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH);
const installed=path.join(root,'node_modules/.pnpm'),versions=fs.readdirSync(installed).filter(n=>n.startsWith('istanbul-lib-instrument@'));assert.equal(versions.length,1);
const {createInstrumenter}=require(path.join(installed,versions[0],'node_modules/istanbul-lib-instrument'));
const {createCoverageMap}=require(path.join(installed,'istanbul-lib-coverage@3.2.2/node_modules/istanbul-lib-coverage'));
const file=path.join(root,'src/infrastructure/bugbot/shadow/session.cjs'),url=pathToFileURL(file).href;
const source=fs.readFileSync(file,'utf8'),sha=text=>crypto.createHash('sha256').update(text).digest('hex'),sourceSha256=sha(source);
const tests=['quality/bugbot/evidence/issue-950/shadow-verification/verification.test.cjs','quality/bugbot/evidence/issue974/session-transport.test.cjs'];
const testSha256=Object.fromEntries(tests.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const instrumented=createInstrumenter({coverageVariable:'__coverage__',produceSourceMap:false}).instrumentSync(source,file);
const originalCompile=Module.prototype._compile;
Module.prototype._compile=function(content,filename){
 if(filename===file&&sha(content)===sourceSha256){assert.equal(sha(fs.readFileSync(file)),sourceSha256);return originalCompile.call(this,instrumented,filename);}
 return originalCompile.call(this,content,filename);
};
Module.registerHooks({load(target,context,next){const loaded=next(target,context);if(target!==url)return loaded;assert.equal(sha(fs.readFileSync(file)),sourceSha256);return {...loaded,source:instrumented};}});
process.on('exit',()=>{
 for(const [relative,digest] of Object.entries(testSha256))assert.equal(sha(fs.readFileSync(path.join(root,relative))),digest,'test bytes changed after pre-load capture');
 const data=globalThis.__coverage__?.[file];if(!data){process.exitCode=1;return;}
 const coverage=createCoverageMap({[file]:data}),summary=coverage.fileCoverageFor(file).toSummary().toJSON();
 const gate=summary.statements.pct>=95&&summary.lines.pct>=95&&summary.branches.pct>=90&&summary.functions.pct>=90;
 fs.writeFileSync(path.join(output,'coverage-final.json'),JSON.stringify(coverage.toJSON()),{mode:0o600});
 fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify({schemaVersion:1,kind:'AST component coverage; original semantic suite plus repository provider-transport fault group, test hashes captured before imports and revalidated at exit; fake child/timers are not native SDK proof',source:file,sourceSha256,testSha256,summary,changedModuleGate:gate,qualificationModelCalls:0,nativeSdkAcceptance:false,production:'disabled'},null,2)+'\n',{mode:0o600});
 console.log('SESSION_CHANGED_MODULE_COVERAGE',JSON.stringify({summary,gate}));if(!gate)process.exitCode=1;
});
require(path.join(root,'quality/bugbot/evidence/issue-950/shadow-verification/verification.test.cjs'));
require(path.join(root,'quality/bugbot/evidence/issue974/session-transport.test.cjs'));
