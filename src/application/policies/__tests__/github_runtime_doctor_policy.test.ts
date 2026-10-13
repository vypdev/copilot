import { doctorRepositoryFixture } from '../../usecases/__tests__/fixtures/runtime_doctor_fixture';
import { doctorRepositoryPrerequisites, doctorWorkflowContracts, validDoctorConfiguration } from '../github_runtime_doctor_policy';
import type { DoctorConfiguration, DoctorRepositoryRead } from '../../ports/github_runtime_doctor_ports';
const config: DoctorConfiguration = { profile: { schemaVersion: 1, enabled: ['feature'] }, preBranchSdd: true,
    issueManagedBranches: true, dependencyBranch: 'develop' };
function changed(path: keyof ReturnType<typeof doctorRepositoryFixture>['files'], text?: string) {
    const snapshot = doctorRepositoryFixture();
    return { ...snapshot, files: { ...snapshot.files, [path]: text === undefined ? { state: 'missing' as const } : { state: 'present' as const, text } } };
}
describe('runtime doctor pure prerequisite decisions', () => {
    it('validates admitted configuration through the existing profile and start policies', () => expect(validDoctorConfiguration(config)).toBe(true));
    it('does not turn a missing configuration into valid defaults', () => expect(validDoctorConfiguration(undefined)).toBe(false));
    it('rejects incompatible prebranch and managed-branch flags', () => expect(validDoctorConfiguration({ ...config, issueManagedBranches: false })).toBe(false));
    it('rejects retired issue-profile versions', () => expect(validDoctorConfiguration({ ...config, profile: { schemaVersion: 2 } } as unknown as DoctorConfiguration)).toBe(false));
    it('rejects unknown issue kinds', () => expect(validDoctorConfiguration({ ...config, profile: { schemaVersion: 1, enabled: ['made-up'] } } as unknown as DoctorConfiguration)).toBe(false));
    it('rejects unsafe dependency references', () => expect(validDoctorConfiguration({ ...config, dependencyBranch: '--upload=/private' })).toBe(false));
    it.each([null, 123, true, ['develop'], undefined])('rejects non-string dependency branch %#', dependencyBranch => {
        expect(validDoctorConfiguration({...config, dependencyBranch} as unknown as DoctorConfiguration)).toBe(false);
    });
    it('blocks an empty catalog according to the canonical specification contract', () => {
        expect(doctorRepositoryPrerequisites(changed('specs/catalog.json', JSON.stringify({version: 1, capabilities: []})))).toBe('blocked');
    });
    it('validates catalog, template and standard from one snapshot', () => expect(doctorRepositoryPrerequisites(doctorRepositoryFixture())).toBe('pass'));
    it('keeps unreadable prerequisites unavailable', () => expect(doctorRepositoryPrerequisites({ state: 'unavailable' })).toBe('unavailable'));
    it('blocks a proven missing specification standard', () => expect(doctorRepositoryPrerequisites(changed('specs/README.md'))).toBe('blocked'));
    it('blocks malformed catalog JSON', () => expect(doctorRepositoryPrerequisites(changed('specs/catalog.json', '{'))).toBe('blocked'));
    it('blocks unsupported catalog versions', () => expect(doctorRepositoryPrerequisites(changed('specs/catalog.json', '{"version":2,"capabilities":[]}'))).toBe('blocked'));
    it('blocks duplicate capability identities', () => expect(doctorRepositoryPrerequisites(changed('specs/catalog.json', JSON.stringify({ version: 1,
        capabilities: [{ id: 'safe', specs: ['specs/safe.md'] }, { id: 'safe', specs: ['specs/safe.md'] }] })))).toBe('blocked'));
    it('blocks unsafe capability source paths', () => expect(doctorRepositoryPrerequisites(changed('specs/catalog.json', JSON.stringify({ version: 1,
        capabilities: [{ id: 'safe', specs: ['../private.md'] }] })))).toBe('blocked'));
    it('blocks malformed capability identifiers', () => expect(doctorRepositoryPrerequisites(changed('specs/catalog.json', JSON.stringify({ version: 1,
        capabilities: [{ id: '@mention', specs: ['specs/safe.md'] }] })))).toBe('blocked'));
    it('blocks a template without a Markdown title', () => expect(doctorRepositoryPrerequisites(changed('specs/_template.md', 'empty standard'))).toBe('blocked'));
});
describe('installed workflow structural contracts', () => {
    it('accepts all required events and local Action steps without claiming write grants', () => expect(doctorWorkflowContracts(doctorRepositoryFixture())).toBe('pass'));
    it('accepts documented event arrays', () => expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue.yml',
        'on: [issues]\njobs: {a: {steps: [{uses: "vypdev/copilot@v3"}]}}'))).toBe('pass'));
    it('accepts event maps parsed with the JSON YAML schema', () => expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue.yml',
        'on: {issues: {types: [labeled]}}\njobs: {a: {steps: [{uses: "./"}]}}'))).toBe('pass'));
    it.each(['opened','null','{unexpected: opened}','[opened, 5]'])('blocks malformed workflow activity types %s', types => {
        expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue.yml',
            `on: {issues: {types: ${types}}}\njobs: {a: {steps: [{uses: "./"}]}}`))).toBe('blocked');
    });
    it('keeps an incomplete repository sample unavailable', () => expect(doctorWorkflowContracts({ state: 'unavailable' })).toBe('unavailable'));
    it('blocks a missing required comment workflow', () => expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue_comment.yml'))).toBe('blocked'));
    it('blocks the wrong event instead of searching another workflow', () => expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue.yml',
        'on: push\njobs: {a: {steps: [{uses: "./"}]}}'))).toBe('blocked'));
    it('blocks a workflow without the installed Action', () => expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue.yml',
        'on: issues\njobs: {a: {steps: [{run: "echo SECRET"}]}}'))).toBe('blocked'));
    it('does not execute YAML constructors or repository code', () => expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue.yml',
        'on: !!js/function "function(){ throw new Error(SECRET) }"'))).toBe('blocked'));
    it('rejects a malformed workflow document', () => expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue.yml', 'on: ['))).toBe('blocked'));
    it('rejects a non-record repository document', () => expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue.yml', '- issues'))).toBe('blocked'));
});

describe('required workflow entry activities', () => {
    it.each([
        ['.github/workflows/copilot_issue.yml', 'issues', 'labeled', 'closed'],
        ['.github/workflows/copilot_issue_comment.yml', 'issue_comment', 'created', 'deleted'],
        ['.github/workflows/copilot_pull_request.yml', 'pull_request', 'opened', 'closed'],
    ] as const)('does not certify %s when its valid activity filter cannot admit the documented entry', (path, event, required, irrelevant) => {
        const text = (activity: string) => `on: {${event}: {types: [${activity}]}}\njobs: {a: {steps: [{uses: "./"}]}}`;
        expect(doctorWorkflowContracts(changed(path, text(irrelevant)))).toBe('blocked');
        expect(doctorWorkflowContracts(changed(path, text(required)))).toBe('pass');
    });
});


describe('strict prerequisite regressions from live review', () => {
    it.each(['develop/', 'develop//main', 'develop/.', '/develop', '.hidden/main', 'feature/topic.lock/child', 'develop.', 'feature/@{previous}'])('rejects an invalid Git branch component %s', dependencyBranch => {
        expect(validDoctorConfiguration({ ...config, dependencyBranch })).toBe(false);
    });
    it.each(['title', 'status', 'scope', 'owner', 'lastVerified'] as const)('does not certify a catalog without canonical %s metadata', field => {
        const snapshot = doctorRepositoryFixture();
        const file = snapshot.files['specs/catalog.json']; if (file.state !== 'present') throw new Error('Fixture unavailable');
        const catalog = JSON.parse(file.text); delete catalog.capabilities[0][field];
        expect(doctorRepositoryPrerequisites(changed('specs/catalog.json', JSON.stringify(catalog)))).toBe('blocked');
    });
    it('does not certify a catalog whose specification is absent from the verified file inventory', () => {
        const snapshot = doctorRepositoryFixture();
        expect(doctorRepositoryPrerequisites({ ...snapshot, trackedFiles: [] } as DoctorRepositoryRead)).toBe('blocked');
    });
});


describe('bounded canonical catalog structure', () => {
    function catalogChange(edit: (capabilities: Record<string, unknown>[]) => void) {
        const snapshot = doctorRepositoryFixture(), file = snapshot.files['specs/catalog.json'];
        if (file.state !== 'present') throw new Error('Fixture unavailable');
        const catalog = JSON.parse(file.text); edit(catalog.capabilities);
        return changed('specs/catalog.json', JSON.stringify(catalog));
    }
    it.each(['unsupported status', 'invalid date syntax', 'impossible date', 'non-text metadata', 'blank metadata',
        'duplicate title', 'duplicate spec owner', 'missing evidence array', 'empty required evidence', 'duplicate evidence',
        'wrong evidence boundary', 'unsafe normalized path', 'missing non-spec file'] as const)('blocks %s', scenario => {
        expect(doctorRepositoryPrerequisites(catalogChange(capabilities => {
            const c = capabilities[0];
            if (scenario === 'unsupported status') c.status = 'done';
            if (scenario === 'invalid date syntax') c.lastVerified = '13/10/2026';
            if (scenario === 'impossible date') c.lastVerified = '2026-02-29';
            if (scenario === 'non-text metadata') c.owner = 42;
            if (scenario === 'blank metadata') c.title = '   ';
            if (scenario === 'duplicate title') capabilities.push({ ...c, id: 'other', specs: ['specs/other.md'] });
            if (scenario === 'duplicate spec owner') capabilities.push({ ...c, id: 'other', title: 'Other' });
            if (scenario === 'missing evidence array') delete c.code;
            if (scenario === 'empty required evidence') c.documentation = [];
            if (scenario === 'duplicate evidence') c.documentation = ['README.md', 'README.md'];
            if (scenario === 'wrong evidence boundary') c.documentation = ['src/domain/locale.ts'];
            if (scenario === 'unsafe normalized path') c.specs = ['specs/../safe.md'];
            if (scenario === 'missing non-spec file') c.documentation = ['docs/missing.mdx'];
        }))).toBe('blocked');
    });
    it('accepts the actual canonical catalog with all verified referenced files and nested specification paths', () => {
        const canonical = require('../../../infrastructure/specification_catalog_validator.cjs');
        const catalog = canonical.readCatalog(process.cwd());
        expect(canonical.validateCatalog(process.cwd(), catalog)).toEqual([]);
        const snapshot = changed('specs/catalog.json', JSON.stringify(catalog));
        const trackedFiles = catalog.capabilities.flatMap((c: Record<string, unknown>) =>
            ['specs', 'workflows', 'entrypoints', 'code', 'tests', 'documentation'].flatMap(field => c[field] as string[]));
        expect(doctorRepositoryPrerequisites({ ...snapshot, trackedFiles })).toBe('pass');
    });
});

describe('complete workflow matrix job ceiling', () => {
    it.each([[256, 'pass'], [257, 'blocked']] as const)('reports a %s-row Action job as %s', (count, expected) => {
        const yaml = `on: issues\njobs:\n  action:\n    strategy:\n      matrix:\n        version: [${Array.from({ length: count }, (_, i) => i).join(', ')}]\n    steps:\n      - uses: ./\n`;
        expect(doctorWorkflowContracts(changed('.github/workflows/copilot_issue.yml', yaml))).toBe(expected);
    });
});

describe('complete tracked specification ownership', () => {
    it.each(['specs/orphan.md', 'specs/nested/orphan.md', 'specs/nested/README.md'])('blocks the unregistered product specification %s', path => {
        const snapshot = doctorRepositoryFixture();
        expect(doctorRepositoryPrerequisites({ ...snapshot, trackedFiles: [...snapshot.trackedFiles, path] })).toBe('blocked');
    });
    it('excludes only the three top-level standard documents from ownership discovery', () => {
        const snapshot = doctorRepositoryFixture();
        expect(doctorRepositoryPrerequisites({ ...snapshot, trackedFiles: [...snapshot.trackedFiles, 'specs/README.md', 'specs/_template.md', 'specs/CATALOG.md', 'docs/guide.md'] })).toBe('pass');
    });
    it('already blocks single-at effective dependency configuration', () => expect(validDoctorConfiguration({ ...config, dependencyBranch: '@' })).toBe(false));
});
