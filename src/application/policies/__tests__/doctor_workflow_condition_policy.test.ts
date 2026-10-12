import { doctorWorkflowCondition } from '../doctor_workflow_condition_policy';
import { doctorWorkflowContracts } from '../github_runtime_doctor_policy';
import { doctorRepositoryFixture } from '../../usecases/__tests__/fixtures/runtime_doctor_fixture';
const contract = (job: string, event = 'issues') => {
    const read = doctorRepositoryFixture();
    return doctorWorkflowContracts({ ...read, files: { ...read.files,
        '.github/workflows/copilot_issue.yml': { state: 'present', text: `on: ${event}\njobs:\n${job}` } } });
};
describe('bounded workflow eligibility evidence', () => {
    it.each([
        [undefined, true], [true, true], [false, false], ['${{ false }}', false],
        ["github.event_name == 'issues'", true], ["github.event_name == 'push'", false],
        ["github.event_name != 'push'", true], ["!(github.event_name == 'issues')", false],
        ['false && vars.UNKNOWN', false], ['true || vars.UNKNOWN', true],
        ['true && vars.UNKNOWN', undefined], ['false || vars.UNKNOWN', undefined],
        ["''", false], ["'enabled'", true], ["'a''b' == 'a''b'", true],
        ['false == true', false], ['true != true', false], ['vars.X != false', undefined],
        ['true false', undefined],
        ["vars.BOT == ''", undefined], ['success()', undefined], ['(', undefined], [null, undefined],
        ['x'.repeat(1001), undefined], ['('.repeat(33) + 'true' + ')'.repeat(33), undefined],
    ] as const)('keeps condition %s evidence closed', (value, expected) => expect(doctorWorkflowCondition(value, 'issues')).toBe(expected));
    it.each(["'0' == false", "false == '0'", "'1' != true"])(
        'withholds a decision for unsupported mixed-type coercion %s', expression => {
            expect(doctorWorkflowCondition(expression,'issues')).toBeUndefined();
        });
    it('keeps a workflow with mixed-type eligibility unavailable instead of proven blocked or active', () => {
        expect(contract('  action: {if: "\'0\' == false", steps: [{uses: "./"}]}')).toBe('unavailable');
    });
    it('blocks a disabled Action job even when an unrelated job runs', () => expect(contract('  disabled: {if: false, steps: [{uses: "./"}]}\n  active: {steps: [{run: "echo fixture"}]}')).toBe('blocked'));
    it('blocks an Action job restricted to a different event', () => expect(contract('  action: {if: "github.event_name == \'push\'", steps: [{uses: "./"}]}')).toBe('blocked'));
    it('blocks a disabled Action step in an eligible job', () => expect(contract('  action: {steps: [{if: false, uses: "./"}]}')).toBe('blocked'));
    it('keeps runtime-dependent job conditions unavailable', () => expect(contract('  action: {if: "vars.BOT == \'\'", steps: [{uses: "./"}]}')).toBe('unavailable'));
    it('keeps unsupported step expressions unavailable', () => expect(contract('  action: {steps: [{if: "success()", uses: "./"}]}')).toBe('unavailable'));
    it('accepts an eligible Action job independently of a disabled candidate', () => expect(contract('  disabled: {if: false, steps: [{uses: "./"}]}\n  active: {if: "github.event_name == \'issues\'", steps: [{uses: "./"}]}')).toBe('pass'));
    it('blocks an event filter that cannot admit any activity', () => expect(contract('  active: {steps: [{uses: "./"}]}', '{issues: {types: []}}')).toBe('blocked'));
});
