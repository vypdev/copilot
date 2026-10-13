import { doctorWorkflowMatrix } from '../doctor_workflow_matrix_policy';
describe('conservative runnable matrix evidence', () => {
    it.each([
        [undefined, true],
        [{ 'max-parallel': 2 }, true],
        [null, undefined],
        [[], undefined],
        [{ matrix: '${{ fromJSON(needs.prepare.outputs.matrix) }}' }, undefined],
        [{ matrix: null }, undefined],
        [{ matrix: [] }, undefined],
        [{ matrix: {} }, undefined],
        [{ matrix: { os: ['ubuntu', 'macos'], version: [20, true] } }, true],
        [{ matrix: { os: [], version: [20] } }, false],
        [{ matrix: { os: [], include: [{ os: 'ubuntu' }] } }, undefined],
        [{ matrix: { os: ['ubuntu'], exclude: [{ os: 'ubuntu' }] } }, undefined],
        [{ matrix: { os: '${{ github.event.client_payload.os }}' } }, undefined],
        [{ matrix: { os: ['${{ vars.OS }}'] } }, undefined],
        [{ matrix: { os: [{ image: 'ubuntu' }] } }, undefined],
        [{ matrix: { version: [Number.NaN] } }, undefined],
    ] as const)('returns only proved structural eligibility for %j', (strategy, expected) => {
        expect(doctorWorkflowMatrix(strategy)).toBe(expected);
    });
});
