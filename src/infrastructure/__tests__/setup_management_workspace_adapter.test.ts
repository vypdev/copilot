import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupManagementWorkspaceAdapter } from '../setup_management_workspace_adapter';
const roots: string[] = [];
function fixture(source?: string) { const root = mkdtempSync(join(tmpdir(), 'copilot-management-')); roots.push(root); const directory = join(root, '.github', 'workflows'); mkdirSync(directory, { recursive: true }); if (source !== undefined) writeFileSync(join(directory, 'copilot.yml'), source); return { root, directory, adapter: new SetupManagementWorkspaceAdapter(root, () => 'revision-a') }; }
const workflow = (inputs: string, extra = '') => `name: Copilot
jobs:
  job:
    ${extra}
    steps:
      - uses: vypdev/copilot@v3
        with:
${inputs.split('\n').map(line => '          ' + line).join('\n')}
`;
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('bounded installation inspection', () => {
 test('an absent workflow directory is not an error', () => { const f = fixture(); rmSync(f.directory, { recursive: true }); expect(f.adapter.inspect()).toMatchObject({ workflows: [], unreadable: false, revision: 'revision-a' }); });
 test('empty workflows with existing guidance are retained as evidence', () => { const f = fixture(); mkdirSync(join(f.root, '.copilot')); writeFileSync(join(f.root, '.copilot', 'repository-profile.json'), '{}'); expect(f.adapter.inspect().guidancePresent).toBe(true); });
 test('parses real Variable references and quoted fallbacks without executing expressions', () => { const f = fixture(workflow("bugbot-comment-limit: ${{ vars.BUGBOT_COMMENT_LIMIT || '20' }}\nproject-ids: ${{ vars.PROJECT_IDS }}")); expect(f.adapter.inspect().workflows[0].inputs).toEqual([{ name: 'bugbot-comment-limit', variable: 'BUGBOT_COMMENT_LIMIT', fallback: '20' }, { name: 'project-ids', variable: 'PROJECT_IDS' }]); expect(f.adapter.inspect().workflows[0].digest).toHaveLength(64); });
 test('literal booleans and numeric values are inspectable', () => { const f = fixture(workflow('ai-members-only: false\nbugbot-comment-limit: 20')); expect(f.adapter.inspect().workflows[0].inputs).toEqual([{ name: 'ai-members-only', literal: 'false' }, { name: 'bugbot-comment-limit', literal: '20' }]); });
 test('literal text and empty fallbacks are preserved', () => { const f = fixture(workflow("agent-provider: codex\nproject-ids: ${{ vars.PROJECT_IDS || '' }}")); expect(f.adapter.inspect().workflows[0].inputs).toContainEqual({ name: 'project-ids', variable: 'PROJECT_IDS', fallback: '' }); });
 test('complex expressions remain unknown rather than guessed', () => { const f = fixture(workflow("bugbot-comment-limit: ${{ vars.LIMIT && '20' || '30' }}")); expect(f.adapter.inspect().workflows[0].inputs).toEqual([{ name: 'bugbot-comment-limit', unsupported: true }]); });
 test('Secrets and token-shaped literals never enter the inspection', () => { const secret = 'github_pat_' + 'a'.repeat(30); const f = fixture(workflow(`token: \${{ secrets.PAT }}\nother: ${secret}\nagent-model: \${{ secrets.MODEL }}`)); const view = f.adapter.inspect(); expect(JSON.stringify(view)).not.toContain(secret); expect(JSON.stringify(view)).not.toContain('secrets.'); expect(view.workflows[0].inputs).toHaveLength(2); });
 test('objects and oversized input text become unknown', () => { const f = fixture(workflow(`agent-model: {nested: value}\nai-ignore-files: ${'x'.repeat(4097)}`)); expect(f.adapter.inspect().workflows[0].inputs.every(input => input.unsupported)).toBe(true); });
 test('unrelated Actions are not counted as Copilot installation', () => { const f = fixture(`jobs:
  job:
    steps:
      - uses: actions/checkout@v4
      - run: echo Copilot
`); expect(f.adapter.inspect().workflows).toEqual([]); });
 test('empty/scalar documents and jobs without steps do not invent an Action', () => { const f = fixture(`jobs:
  a: 2
  b: {steps: nope}
`); writeFileSync(join(f.directory, 'scalar.yaml'), 'just text'); expect(f.adapter.inspect()).toMatchObject({ workflows: [], unreadable: false }); });
 test('malformed YAML does not hide the incomplete state', () => { const f = fixture('jobs: [invalid'); expect(f.adapter.inspect().unreadable).toBe(true); });
 test('oversized workflow files fail closed', () => { const f = fixture('x'.repeat(262145)); expect(f.adapter.inspect()).toMatchObject({ unreadable: true, workflows: [] }); });
 test('non-regular workflow paths are not read', () => { const f = fixture(); mkdirSync(join(f.directory, 'unsafe.yml')); expect(f.adapter.inspect().unreadable).toBe(true); });
 test('more than 100 workflow files fail closed before reading', () => { const f = fixture(); for (let i = 0; i < 101; i++) writeFileSync(join(f.directory, `${i}.yml`), 'jobs: {}'); expect(f.adapter.inspect()).toMatchObject({ unreadable: true, workflows: [] }); });
 test('linked workflow directories cannot escape the checkout', () => { const f = fixture(); const outside = fixture(workflow('bugbot-comment-limit: 20')); rmSync(f.directory, { recursive: true }); symlinkSync(outside.directory, f.directory, 'junction'); expect(f.adapter.inspect()).toMatchObject({ unreadable: true, workflows: [] }); });
 test('linked .github ancestors cannot escape the checkout', () => { const f = fixture(); const outside = fixture(workflow('bugbot-comment-limit: 20')); rmSync(join(f.root, '.github'), { recursive: true }); symlinkSync(join(outside.root, '.github'), join(f.root, '.github'), 'junction'); expect(f.adapter.inspect()).toMatchObject({ unreadable: true, workflows: [] }); });
 test('environment-scoped jobs cannot enable a quick edit', () => { const f = fixture(workflow('bugbot-comment-limit: 20', 'environment: production')); expect(f.adapter.inspect().workflows[0].environmentScoped).toBe(true); });
 test('explicit input environment overrides prevent quick edits', () => { const f = fixture(`jobs:
  job:
    steps:
      - uses: vypdev/copilot@v3
        with: {bugbot-comment-limit: 20}
        env: {INPUT_BUGBOT_COMMENT_LIMIT: 40}
`); expect(f.adapter.inspect().workflows[0].environmentScoped).toBe(true); });
 test('a changed file changes its digest even if selected inputs are unchanged', () => { const f = fixture(workflow('bugbot-comment-limit: 20')); const before = f.adapter.inspect().workflows[0].digest; writeFileSync(join(f.directory, 'copilot.yml'), workflow('bugbot-comment-limit: 20') + '# changed\n'); expect(f.adapter.inspect().workflows[0].digest).not.toBe(before); });
});

test.each(['workflow', 'job'] as const)('%s input environment overrides disable quick edits', scope => {
 const source = workflow('bugbot-comment-limit: 20', scope === 'job' ? 'env: {INPUT_BUGBOT_COMMENT_LIMIT: 40}' : '');
 const f = fixture((scope === 'workflow' ? 'env: {INPUT_BUGBOT_COMMENT_LIMIT: 40}\n'.replace('\\n','\n') : '') + source);
 expect(f.adapter.inspect().workflows[0].environmentScoped).toBe(true);
});

describe('self-hosting repository Action inspection', () => {
 const localWorkflow = () => workflow('bugbot-comment-limit: 20').replace('vypdev/copilot@v3','./');
 test.each(['missing','unrelated','scalar','missing-input'] as const)('a %s local Action is not claimed as Copilot', kind => {
  const f=fixture(localWorkflow()); if(kind !== 'missing') writeFileSync(join(f.root,'action.yml'),kind === 'scalar' ? 'other' : kind === 'missing-input' ? 'name: Copilot - GitHub with super powers\ninputs: {}\n' : 'name: Other\ninputs: {}\n'); expect(f.adapter.inspect().workflows).toEqual([]);
 });
 test('the repository own Action is detected and its metadata is bound to approval', () => {
  const f=fixture(localWorkflow()); const action="name: Copilot - GitHub with super powers\ninputs:\n  bugbot-comment-limit: {default: 20}\n"; writeFileSync(join(f.root,'action.yml'),action); const before=f.adapter.inspect(); expect(before.workflows[0].action).toBe('./'); expect(before.localActionDigest).toHaveLength(64); writeFileSync(join(f.root,'action.yml'),action+'# changed\n');expect(f.adapter.inspect().localActionDigest).not.toBe(before.localActionDigest);
 });
 test.each(['directory','oversized','malformed','symlink'] as const)('unsafe %s Action metadata fails closed', kind => {
  const f=fixture(localWorkflow());const path=join(f.root,'action.yml');if(kind === 'directory') mkdirSync(path);else if(kind==='symlink'){const other=fixture();writeFileSync(join(other.root,'action.yml'),'name: Other');symlinkSync(join(other.root,'action.yml'),path);}else writeFileSync(path,kind==='oversized'?'x'.repeat(262145):'name: [invalid');expect(f.adapter.inspect()).toMatchObject({unreadable:true,workflows:[]});
 });
 test('missing uses and token-shaped Action references cannot enter the view', () => { const f=fixture('jobs:\n  job:\n    steps:\n      - run: echo nothing\n      - uses: vypdev/copilot@github_pat_'+ 'a'.repeat(30));expect(f.adapter.inspect().workflows).toEqual([]); });
});


test('multiple local workflows retain the same Action evidence and all input bindings', () => {
 const source=workflow('bugbot-comment-limit: 20').replace('vypdev/copilot@v3','./');
 const f=fixture(source); writeFileSync(join(f.directory,'second.yml'),source);
 writeFileSync(join(f.root,'action.yml'), 'name: Copilot - GitHub with super powers\ninputs:\n  bugbot-comment-limit: {default: 20}\n');
 expect(f.adapter.inspect()).toMatchObject({ unreadable:false, localActionDigest:expect.any(String), workflows:[{file:'copilot.yml',action:'./'},{file:'second.yml',action:'./'}] });
});
