import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { COMMUNICATION_BUDGET_PATH, refreshBranchSyncCommunicationBudget } from '../branch_sync_communication_budget';
import type { GitCommitPort } from '../../application/ports/git_ports';
import { BranchSyncWorkspaceAdapter } from '../branch_sync_workspace_adapter';
import * as budgetRefresh from '../branch_sync_communication_budget';
import * as logging from '../../application/ports/logging_ports';

function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'copilot-sync-budget-'));
    const global = join(root, 'empty-config'); writeFileSync(global, '');
    const env = { ...process.env, GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: '1' };
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    git('init'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '--allow-empty', '-m', 'base');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '--allow-empty', '-m', 'tag target'); git('tag', '0bb83b75');
    const write = (path: string, text: string) => { mkdirSync(dirname(join(root,path)), {recursive:true});writeFileSync(join(root,path),text); };
    const budgets = [
        { id:'semantic-github-publication',spec:'specs/semantic-github-publication-and-notification.md',requiredCases:135,allocatedCases:245,files:[{path:'src/semantic.test.ts',qualifyingCases:247}] },
        { id:'repository-locale-localization',spec:'specs/repository-locale-and-localization.md',requiredCases:146,allocatedCases:157,files:[{path:'src/locale.test.ts',qualifyingCases:153}] },
    ];
    for (const b of budgets) { write(b.spec,`at least **${b.requiredCases} distinct cases**`);write(b.files[0].path,Array.from({length:b.files[0].qualifyingCases},(_,i)=>`it('case ${i}',()=>{});`).join('\n')); }
    const ledger = {version:1,baseline:'0bb83b75^',method:'fixture',budgets};
    const publish = () => write(COMMUNICATION_BUDGET_PATH,JSON.stringify(ledger)); publish();
    return {root,ledger,publish,write,git,env};
}
const cases = ['derived totals','unchanged healthy ledger','wrong minimum','wrong baseline','duplicate evidence','overclaimed evidence','outside evidence','missing evidence','malformed JSON','remaining conflict markers','oversized ledger','unsafe count','null metadata','oversized output','missing ledger','linked ledger directory'] as const;
describe('trusted communication-budget totals during branch synchronization',()=>{
    it.each(cases)('%s',scenario=>{
        const f=fixture();const report=jest.spyOn(logging,'logInfo').mockImplementation(()=>undefined);
        let outside:string|undefined;
        try {
            if(scenario==='unchanged healthy ledger') {f.ledger.budgets[0].allocatedCases=247;f.ledger.budgets[1].allocatedCases=153;f.publish();}
            if(scenario==='wrong minimum') {f.ledger.budgets[0].requiredCases=1;f.publish();}
            if(scenario==='wrong baseline') {f.ledger.baseline='HEAD';f.publish();}
            if(scenario==='duplicate evidence') {f.ledger.budgets[1].files[0].path=f.ledger.budgets[0].files[0].path;f.publish();}
            if(scenario==='overclaimed evidence') {f.ledger.budgets[0].files[0].qualifyingCases=248;f.publish();}
            if(scenario==='outside evidence') {f.ledger.budgets[0].files[0].path='../private.test.ts';f.publish();}
            if(scenario==='missing evidence') {rmSync(join(f.root,'src/locale.test.ts'));}
            if(scenario==='malformed JSON') f.write(COMMUNICATION_BUDGET_PATH,'{"secret":"fixture-secret"');
            if(scenario==='remaining conflict markers') f.write(COMMUNICATION_BUDGET_PATH,'<<<<<<< secret\n{}\n=======\n{}\n>>>>>>> secret\n');
            if(scenario==='oversized ledger') f.write(COMMUNICATION_BUDGET_PATH,' '.repeat(512*1024+1));
            if(scenario==='unsafe count') {f.ledger.budgets[0].files[0].qualifyingCases=-1;f.publish();}
            if(scenario==='null metadata') f.write(COMMUNICATION_BUDGET_PATH,'null');
            if(scenario==='oversized output') { f.ledger.method='x'.repeat(512*1024-JSON.stringify({...f.ledger,method:''}).length-10); f.publish(); }
            if(scenario==='missing ledger') rmSync(join(f.root,COMMUNICATION_BUDGET_PATH));
            if(scenario==='linked ledger directory') {
                outside=mkdtempSync(join(tmpdir(),'copilot-outside-budget-'));writeFileSync(join(outside,'github_communication_test_budget.json'),'{}');
                rmSync(join(f.root,'src/architecture'),{recursive:true});symlinkSync(outside,join(f.root,'src/architecture'),'junction');
            }
            const path=join(f.root,COMMUNICATION_BUDGET_PATH);
            const before=scenario==='missing ledger'?undefined:readFileSync(path,'utf8');
            const valid=scenario==='derived totals'||scenario==='unchanged healthy ledger';
            expect(refreshBranchSyncCommunicationBudget(f.root)).toBe(valid);
            if(valid) {
                const normalized=JSON.parse(readFileSync(path,'utf8'));
                expect(normalized).toEqual({...f.ledger,budgets:f.ledger.budgets.map(b=>({...b,allocatedCases:b.files.reduce((sum,e)=>sum+e.qualifyingCases,0)}))});
                expect(report).not.toHaveBeenCalled();
                if(scenario==='unchanged healthy ledger') expect(readFileSync(path,'utf8')).toBe(before);
            } else {
                if(before!==undefined)expect(readFileSync(path,'utf8')).toBe(before);
                expect(report).toHaveBeenCalledTimes(1);
                expect(report.mock.calls[0][0]).toMatch(/^Branch synchronization communication budget rejected \([a-z-]+\)\.$/u);
                expect(JSON.stringify(report.mock.calls)).not.toContain('fixture-secret');expect(JSON.stringify(report.mock.calls)).not.toContain(f.root);
            }
        } finally {report.mockRestore();rmSync(f.root,{recursive:true,force:true});if(outside)rmSync(outside,{recursive:true,force:true});}
    });
});

describe('communication-budget normalization in real managed merge validation', () => {
    it.each(['authorized conflict', 'unclaimed conflict', 'invalid evidence', 'verification mutation', 'moved head during abort'] as const)('%s', async scenario => {
        const f = fixture();
        const remote = mkdtempSync(join(tmpdir(), 'copilot-sync-budget-remote-'));
        const refresh = jest.spyOn(budgetRefresh, 'refreshBranchSyncCommunicationBudget');
        const report = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
        try {
            const commit = (message: string) => {
                f.git('add', '.');
                f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', message);
            };
            f.git('checkout', '-B', 'develop');
            f.ledger.budgets[0].allocatedCases = 240; f.publish(); commit('base');
            f.git('branch', 'feature/42');
            f.ledger.budgets[0].allocatedCases = 250; f.publish(); commit('parent');
            f.git('checkout', 'feature/42');
            f.ledger.budgets[0].allocatedCases = 245; f.publish(); commit('child');
            execFileSync('git', ['init', '--bare', remote], { env: f.env, stdio: 'ignore' });
            f.git('remote', 'add', 'origin', remote); f.git('push', 'origin', 'develop', 'feature/42');
            const git = {
                execute: jest.fn(async (program: string, args: readonly string[], options?: {stdout?: (output: Buffer) => void}) => {
                    const output = execFileSync(program, [...args], { cwd: f.root, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
                    options?.stdout?.(output); return 0;
                }),
                fetch: jest.fn(async (branch: string) => { f.git('fetch', 'origin', branch); }),
                stagePaths: jest.fn(async (paths: readonly string[]) => { f.git('add', '--', ...paths); }),
                stageAll: jest.fn(), commit: jest.fn(), push: jest.fn(), configureAuthor: jest.fn(),
            } as unknown as jest.Mocked<GitCommitPort>;
            const adapter = new BranchSyncWorkspaceAdapter(git, f.root);
            expect(await adapter.prepare('develop', 'feature/42', 'fixture')).toMatchObject({kind: 'conflicted', conflictPaths: [COMMUNICATION_BUDGET_PATH]});
            if (scenario === 'invalid evidence') f.ledger.budgets[0].files[0].qualifyingCases = 248;
            f.publish();
            const before = readFileSync(join(f.root, COMMUNICATION_BUDGET_PATH), 'utf8');
            const result = await adapter.validatePreparedMerge(scenario === 'unclaimed conflict' ? [] : [COMMUNICATION_BUDGET_PATH]);
            if (scenario === 'unclaimed conflict' || scenario === 'invalid evidence') {
                expect(result).toMatchObject({valid: false, code: scenario === 'unclaimed conflict' ? 'merge-state-mismatch' : 'communication-budget-invalid'});
                expect(readFileSync(join(f.root, COMMUNICATION_BUDGET_PATH), 'utf8')).toBe(before);
                expect(git.stagePaths).not.toHaveBeenCalled();
                if (scenario === 'unclaimed conflict') expect(refresh).not.toHaveBeenCalled();
            } else {
                expect(result).toEqual({valid: true});
                expect(git.stagePaths).toHaveBeenCalledWith([COMMUNICATION_BUDGET_PATH]);
                expect(JSON.parse(readFileSync(join(f.root, COMMUNICATION_BUDGET_PATH), 'utf8')).budgets.map((b: {allocatedCases: number}) => b.allocatedCases)).toEqual([247, 153]);
                expect(refresh).toHaveBeenCalledTimes(1);
                if (scenario === 'verification mutation') {
                    f.publish();
                    expect(await adapter.validatePreparedMerge([COMMUNICATION_BUDGET_PATH])).toMatchObject({valid: false, code: 'unstaged-changes'});
                    expect(readFileSync(join(f.root, COMMUNICATION_BUDGET_PATH), 'utf8')).toBe(before);
                } else expect(await adapter.validatePreparedMerge([COMMUNICATION_BUDGET_PATH])).toEqual({valid: true});
                expect(refresh).toHaveBeenCalledTimes(1);
                if (scenario === 'moved head during abort') {
                    f.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', 'unexpected completed merge');
                    const head = f.git('rev-parse', 'HEAD').toString();
                    await expect(adapter.abort()).rejects.toThrow();
                    expect(f.git('rev-parse', 'HEAD').toString()).toBe(head);
                    expect(git.execute.mock.calls.some(([,args]) => args[0] === 'reset')).toBe(false);
                }
            }
            expect(git.stageAll).not.toHaveBeenCalled(); expect(git.push).not.toHaveBeenCalled();
            await adapter.abort();
            expect(f.git('status', '--porcelain').toString()).toBe('');
            if (scenario === 'verification mutation') {
                expect(git.execute.mock.calls.some(([,args]) => args[0] === 'reset')).toBe(true);
                expect(f.git('rev-parse', 'HEAD').toString()).toBe(f.git('rev-parse', 'origin/feature/42').toString());
            }
        } finally {
            refresh.mockRestore(); report.mockRestore();
            rmSync(f.root, {recursive: true, force: true}); rmSync(remote, {recursive: true, force: true});
        }
    });
});
