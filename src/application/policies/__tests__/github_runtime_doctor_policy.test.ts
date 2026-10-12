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
        'on: {issues: {types: [opened]}}\njobs: {a: {steps: [{uses: "./"}]}}'))).toBe('pass'));
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
