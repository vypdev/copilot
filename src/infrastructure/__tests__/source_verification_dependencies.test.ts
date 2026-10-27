import filesystem from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, symlinkSync, linkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureSourceDependencyPreparation, type SourceDependencyProcess } from '../source_verification_dependencies';
import { SourceDependencyError } from '../../application/policies/source_verification_dependency_policy';
import * as executable from '../verification_executable';
import { GitCommitAdapter } from '../git_commit_adapter';

const metadata = {GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'vypdev/copilot', COPILOT_PREPARE_VERIFICATION: 'true', PATH: process.env.PATH};
const manifest = {name: '@vypdev/copilot', packageManager: 'pnpm@10.12.4'};
let root: string;
let tool: string;
let cwd: jest.SpyInstance;
const git = (...args: string[]): string => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe']}).trim();
const env = (): Record<string, string> => ({PATH: process.env.PATH!, HOME: join(tool, 'home'), CI: 'true'});
const prepare = (execute?: SourceDependencyProcess) => captureSourceDependencyPreparation(metadata, root, execute, 'linux');
const write = (path: string, value: string): void => writeFileSync(join(root, path), value);

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'copilot-source-graph-')));
    tool = realpathSync(mkdtempSync(join(tmpdir(), 'copilot-source-tool-')));
    write('package.json', JSON.stringify(manifest));
    write('pnpm-workspace.yaml', 'packages: []\noverrides: {}\n');
    write('pnpm-lock.yaml', "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
    write('.gitignore', 'node_modules/\n.tmp/\n');
    git('init'); git('config','user.name','Test'); git('config','user.email','test@example.test'); git('add','.'); git('commit','-m','base');
    writeFileSync(join(tool,'pnpm.cjs'), 'console.log("10.12.4")');
    mkdirSync(join(tool,'home'));
    jest.spyOn(executable, 'verificationExecutable').mockReturnValue(join(tool,'pnpm.cjs'));
    cwd = jest.spyOn(process, 'cwd').mockImplementation(() => root);
});
afterEach(() => { jest.restoreAllMocks(); rmSync(root,{recursive:true,force:true}); rmSync(tool,{recursive:true,force:true}); });

it.each([{GITHUB_ACTIONS:'false'}, {GITHUB_REPOSITORY:'consumer/repo'}, {COPILOT_PREPARE_VERIFICATION:'false'}])('does not infer installation authority from %j', async override => {
    const execute = jest.fn();
    await captureSourceDependencyPreparation({...metadata,...override},root,execute,'linux')(env());
    expect(execute).not.toHaveBeenCalled();
});

it.each(['unavailable', 'corepack', 'candidate', 'platform'])('fails closed for an unprovisioned source tool: %s', async scenario => {
    if (scenario === 'unavailable') jest.mocked(executable.verificationExecutable).mockImplementation(() => {throw Error('secret');});
    if (scenario === 'corepack') {writeFileSync(join(tool,'pnpm.js'),''); jest.mocked(executable.verificationExecutable).mockReturnValue(join(tool,'pnpm.js'));}
    if (scenario === 'candidate') {write('pnpm.cjs',''); jest.mocked(executable.verificationExecutable).mockReturnValue(join(root,'pnpm.cjs'));}
    const execute = jest.fn();
    const preparation = captureSourceDependencyPreparation(metadata,root,execute,scenario === 'platform' ? 'aix' : 'linux');
    await expect(preparation(env())).rejects.toMatchObject({reason:'tool-unavailable'});
    expect(execute).not.toHaveBeenCalled();
});

it.each([
    ['missing lock', () => rmSync(join(root,'pnpm-lock.yaml'))],
    ['linked manifest', () => {rmSync(join(root,'package.json')); symlinkSync(join(tool,'pnpm.cjs'),join(root,'package.json'));}],
    ['hardlinked manifest', () => linkSync(join(root,'package.json'),join(tool,'manifest.json'))],
    ['oversized manifest', () => write('package.json','x'.repeat(131_073))],
    ['wrong name', () => write('package.json',JSON.stringify({...manifest,name:'consumer'}))],
    ['wrong manager', () => write('package.json',JSON.stringify({...manifest,packageManager:'pnpm@11'}))],
    ['plugin in manifest', () => write('package.json',JSON.stringify({...manifest,pnpm:{configDependencies:{}}}))],
    ['null yaml', () => write('pnpm-workspace.yaml','null')],
    ['array yaml', () => write('pnpm-workspace.yaml','[]')],
    ['string yaml', () => write('pnpm-workspace.yaml','value')],
    ['plugin in workspace', () => write('pnpm-workspace.yaml','configDependencies: {}')],
    ['non-array packages', () => write('pnpm-workspace.yaml','packages: x')],
    ['too many packages', () => write('pnpm-workspace.yaml','packages: ['+Array(33).fill('extension').join(',')+']')],
    ['non-string package', () => write('pnpm-workspace.yaml','packages: [42]')],
    ['parent package', () => write('pnpm-workspace.yaml','packages: [../extension]')],
    ['oversized package', () => write('pnpm-workspace.yaml','packages: ['+'a'.repeat(201)+']')],
    ['npmrc', () => write('.npmrc','ignore-scripts=false')],
    ['member config', () => {mkdirSync(join(root,'extension')); write('extension/package.json','{"pnpm":{}}'); write('pnpm-workspace.yaml','packages: [extension]');}],
] as const)('rejects unsupported graph without executing candidate bootstrap: %s', async (_name, change) => {
    change(); const execute = jest.fn();
    await expect(prepare(execute)(env())).rejects.toMatchObject({reason:'unsupported-graph'});
    expect(execute).not.toHaveBeenCalled();
});

it('uses the current workspace on every verifier, same isolated environment, fixed argv and no cached readiness', async () => {
    const execute = jest.fn().mockResolvedValue('10.12.4');
    const setup = prepare(execute); const environment = env();
    await setup(environment);
    mkdirSync(join(root,'extension')); write('extension/package.json','{"name":"extension"}'); write('pnpm-workspace.yaml','packages: [extension]');
    await setup(environment);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[0][2]).toBe(tool); // --version must never load candidate configuration.
    expect(execute.mock.calls[3]).toEqual([process.execPath,[join(tool,'pnpm.cjs'),'--config.manage-package-manager-versions=false','--ignore-pnpmfile','install','--frozen-lockfile','--ignore-scripts','--prod=false','--reporter=silent','--store-dir',join(root,'.tmp/copilot-verification-store')],root,environment]);
    write('pnpm-workspace.yaml','overrides: {}'); // Root-only historical workspace remains supported.
    await setup(environment);
    expect(execute).toHaveBeenCalledTimes(6);
});

it.each(['version', 'process', 'changed', 'cwd'])('withholds verification after %s failure and removes its private profile', async scenario => {
    let home = '';
    const execute: SourceDependencyProcess = async (_node,args,_root,environment) => {
        home = environment.HOME;
        if (scenario === 'process') throw Error('private registry URL token=secret');
        if (scenario === 'version') return '11.0.0';
        if (args.includes('install') && scenario === 'changed') write('package.json',JSON.stringify({...manifest,description:'mutated'}));
        return '10.12.4';
    };
    const preparation = prepare(execute);
    if (scenario === 'cwd') cwd.mockReturnValue(tool);
    const verifier = jest.fn();
    const adapter = new GitCommitAdapter(verifier,()=>{},undefined,preparation);
    await expect(adapter.execute('pnpm',['run','typecheck'],{untrusted:true,verifyRuntimePrerequisites:true})).rejects.toBeInstanceOf(SourceDependencyError);
    expect(verifier).not.toHaveBeenCalled();
    if (home) expect(existsSync(home)).toBe(false);
});

it('runs the fixed child process with bounded suppressed output and handles a real failure', async () => {
    await captureSourceDependencyPreparation(metadata,root)(env());
    writeFileSync(join(tool,'pnpm.cjs'),'process.stderr.write("private registry secret"); process.exit(1)');
    await expect(captureSourceDependencyPreparation(metadata,root)(env())).rejects.toMatchObject({reason:'install-failed'});
});

it.each(['clean','conflicted'])('reproduces default-root readiness versus a real %s candidate workspace', async scenario => {
    const installedGraphs: string[] = [];
    const execute: SourceDependencyProcess = async (_node,args) => {
        if (args.includes('install')) {
            installedGraphs.push(git('hash-object','pnpm-workspace.yaml'));
            if (existsSync(join(root,'extension/package.json'))) {mkdirSync(join(root,'extension/node_modules'),{recursive:true}); write('extension/node_modules/tool.js','module.exports = true;');}
        }
        return '10.12.4';
    };
    const preparation = prepare(execute);
    await preparation(env()); // Old workflow prepared default master before checkout.
    write('conflict.txt','base\n'); git('add','.'); git('commit','-m','common');
    git('branch','child'); git('checkout','-b','parent');
    mkdirSync(join(root,'extension')); write('extension/package.json','{"name":"extension"}'); write('pnpm-workspace.yaml','packages: [extension]');
    write('conflict.txt','parent\n'); git('add','.'); git('commit','-m','workspace');
    git('checkout','child');
    if (scenario === 'conflicted') {write('conflict.txt','child\n'); git('add','.'); git('commit','-m','child');}
    const head = git('rev-parse','HEAD');
    try {git('merge','--no-ff','--no-commit','parent');} catch {expect(scenario).toBe('conflicted'); write('conflict.txt','resolved\n'); git('add','conflict.txt');}
    expect(existsSync(join(root,'extension/node_modules/tool.js'))).toBe(false);
    const verifier = jest.fn(async () => {expect(existsSync(join(root,'extension/node_modules/tool.js'))).toBe(true); return 0;});
    await new GitCommitAdapter(verifier,()=>{},undefined,preparation).execute('pnpm',['run','typecheck'],{untrusted:true,verifyRuntimePrerequisites:true});
    expect(installedGraphs[0]).not.toBe(installedGraphs[1]);
    expect(verifier).toHaveBeenCalledTimes(1);
    git('merge','--abort'); expect(git('rev-parse','HEAD')).toBe(head);
});

it('keeps absent source opt-in disabled through production defaults', async () => {
    const previous = process.env.COPILOT_PREPARE_VERIFICATION;
    delete process.env.COPILOT_PREPARE_VERIFICATION;
    try {await captureSourceDependencyPreparation()(env());} finally {if(previous !== undefined) process.env.COPILOT_PREPARE_VERIFICATION=previous;}
});
it.each(['.tmp','.tmp/copilot-verification-store'])('rejects linked cache path %s before any install', async cache => {
    if(cache.includes('/')) mkdirSync(join(root,'.tmp'));
    symlinkSync(tool,join(root,cache),'junction');
    await expect(prepare(jest.fn())(env())).rejects.toMatchObject({reason:'unsupported-graph'});
});
it('fails closed when the candidate cannot be bound to Git before installation', async () => {
    rmSync(join(root,'.git'),{recursive:true,force:true});
    const execute=jest.fn();
    await expect(prepare(execute)(env())).rejects.toMatchObject({reason:'candidate-changed'});
    expect(execute).not.toHaveBeenCalled();
});
it.each(['dev','ino','size','nlink','read'])('rejects a changed manifest descriptor: %s', async field => {
    if(field==='read') jest.spyOn(filesystem,'readSync').mockImplementation((() => 131073) as never);
    else {
        const original=filesystem.fstatSync;
        jest.spyOn(filesystem,'fstatSync').mockImplementation(((descriptor: number, options: {bigint:true}) => {
            const stat=original(descriptor,options); return {...stat,[field]:stat[field as 'dev']+1n};
        }) as never);
    }
    await expect(prepare(jest.fn())(env())).rejects.toMatchObject({reason:'unsupported-graph'});
});
it('refuses a workspace member outside the candidate root', async () => {
    writeFileSync(join(tool,'package.json'),'{}');
    symlinkSync(tool,join(root,'extension'),'junction');write('pnpm-workspace.yaml','packages: [extension]');
    await expect(prepare(jest.fn())(env())).rejects.toMatchObject({reason:'unsupported-graph'});
});

it('resolves the official pnpm/action-setup .bin layout without executing its shell shim', async () => {
    const home=join(tool,'node_modules/.bin');const entry=join(tool,'node_modules/pnpm/bin/pnpm.cjs');
    mkdirSync(home,{recursive:true});mkdirSync(join(tool,'node_modules/pnpm/bin'),{recursive:true});
    writeFileSync(join(home,'pnpm'),'#!/bin/sh\nexit 99');writeFileSync(entry,'console.log("10.12.4")');
    jest.mocked(executable.verificationExecutable).mockImplementation(() => {throw Error('PATH shadowed by a later runtime setup');});
    const execute=jest.fn().mockResolvedValue('10.12.4');
    await captureSourceDependencyPreparation({...metadata,PNPM_HOME:home},root,execute,'linux')(env());
    expect(execute.mock.calls[0]).toEqual([process.execPath,[entry,'--config.manage-package-manager-versions=false','--ignore-pnpmfile','--version'],join(tool,'node_modules/pnpm/bin'),env()]);
    expect(execute.mock.calls[1][1]).toContain('install');
});
it.each(['relative','foreign','candidate'])('rejects mismatched provisioned pnpm home: %s', async scenario => {
    writeFileSync(join(tool,'shim'),'');jest.mocked(executable.verificationExecutable).mockReturnValue(join(tool,'shim'));
    const home=scenario==='relative'?'relative':scenario==='foreign'?join(tool,'home'):root;
    if(scenario==='candidate') {write('shim','');jest.mocked(executable.verificationExecutable).mockReturnValue(join(root,'shim'));}
    await expect(captureSourceDependencyPreparation({...metadata,PNPM_HOME:home},root,jest.fn(),'linux')(env())).rejects.toMatchObject({reason:'tool-unavailable'});
});

it('rejects a provisioned package entry that resolves to a different wrapper type', async () => {
    const home=join(tool,'node_modules/.bin');mkdirSync(home,{recursive:true});mkdirSync(join(tool,'node_modules/pnpm/bin'),{recursive:true});
    writeFileSync(join(home,'pnpm'),'');writeFileSync(join(tool,'pnpm.js'),'');
    symlinkSync(join(tool,'pnpm.js'),join(tool,'node_modules/pnpm/bin/pnpm.cjs'));
    jest.mocked(executable.verificationExecutable).mockReturnValue(join(home,'pnpm'));
    await expect(captureSourceDependencyPreparation({...metadata,PNPM_HOME:home},root,jest.fn(),'linux')(env())).rejects.toMatchObject({reason:'tool-unavailable'});
});

it.each(['linux','darwin','win32'] as const)('prepares the provisioned source tool on supported %s runners', async platform => {
    const execute=jest.fn().mockResolvedValue('10.12.4');
    await captureSourceDependencyPreparation(metadata,root,execute,platform)(env());
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][1]).toContain('install');
});

it.each(['.tmp','.tmp/copilot-verification-store'])('rejects a dangling cache symlink at %s before starting pnpm', async cache => {
    if(cache.includes('/')) mkdirSync(join(root,'.tmp'));
    symlinkSync(join(tool,'missing-target'),join(root,cache),'junction');
    expect(existsSync(join(root,cache))).toBe(false);
    const execute=jest.fn().mockResolvedValue('10.12.4');
    await expect(prepare(execute)(env())).rejects.toMatchObject({reason:'unsupported-graph'});
    expect(execute).not.toHaveBeenCalled();
});
it('fails closed when cache metadata cannot be inspected', async () => {
    const original=filesystem.lstatSync;
    jest.spyOn(filesystem,'lstatSync').mockImplementation(((file: string, options: unknown) => {
        if(String(file)===join(root,'.tmp')) throw Object.assign(new Error('private path'),{code:'EACCES'});
        return original(file,options as never);
    }) as never);
    const execute=jest.fn().mockResolvedValue('10.12.4');
    await expect(prepare(execute)(env())).rejects.toMatchObject({reason:'unsupported-graph'});
    expect(execute).not.toHaveBeenCalled();
});

it.each(['','extension'])('rejects a dangling npmrc in source workspace member %s', async member => {
    if(member) {mkdirSync(join(root,member));write('extension/package.json','{"name":"extension"}');write('pnpm-workspace.yaml','packages: [extension]');}
    symlinkSync(join(tool,'missing-npmrc'),join(root,member,'.npmrc'));
    const execute=jest.fn().mockResolvedValue('10.12.4');
    await expect(prepare(execute)(env())).rejects.toMatchObject({reason:'unsupported-graph'});
    expect(execute).not.toHaveBeenCalled();
});
