import { copilotCommentRunner, isCopilotCommentWorkflow, isCopilotCommentRunner, COPILOT_COMMENT_REMOTE_WORKFLOW, COPILOT_COMMENT_SELF_WORKFLOW } from '../copilot_comment_workflow';

describe('known comment coordination and runner contract', () => {
    it.each([COPILOT_COMMENT_REMOTE_WORKFLOW, COPILOT_COMMENT_SELF_WORKFLOW,
        'vypdev/copilot/.github/workflows/copilot_comment_runtime.yml@v3.10.0',
        `vypdev/copilot/.github/workflows/copilot_comment_runtime.yml@${'a'.repeat(40)}`])('recognizes the reviewed workflow %s', value => {
        expect(isCopilotCommentWorkflow(value)).toBe(true);
    });
    it.each([undefined, 42, './', 'vypdev/copilot@v3', 'other/copilot/.github/workflows/copilot_comment_runtime.yml@v3',
        'vypdev/copilot/.github/workflows/other.yml@v3', 'vypdev/copilot/.github/workflows/copilot_comment_runtime.yml@master',
        'vypdev/copilot/.github/workflows/copilot_comment_runtime.yml@v4'])('does not interpret arbitrary workflow inputs as a runner: %s', value => {
        expect(isCopilotCommentWorkflow(value)).toBe(false);
    });
    it('retains ordinary native-job routing', () => {
        expect(copilotCommentRunner({ 'runs-on': ['self-hosted', 'Linux'] })).toEqual(['self-hosted', 'Linux']);
        expect(copilotCommentRunner(undefined)).toBeUndefined();
    });
    it.each(['ubuntu-latest', ['self-hosted', 'codex', 'Linux'], { group: 'trusted', labels: ['self-hosted', 'Linux'] }])('reads the exact reusable route %j', route => {
        expect(copilotCommentRunner({ uses: COPILOT_COMMENT_REMOTE_WORKFLOW, with: { 'runs-on': JSON.stringify(route) } })).toEqual(route);
    });
    it.each([undefined, {}, { 'runs-on': 42 }, { 'runs-on': 'invalid json' }, { 'runs-on': 'null' }])('blocks missing or malformed reusable routing %j', inputs => {
        expect(() => copilotCommentRunner({ uses: COPILOT_COMMENT_REMOTE_WORKFLOW, with: inputs })).toThrow('review the workflow');
    });
    it.each(['ubuntu-latest', ['self-hosted', 'Linux'], { group: 'trusted' }, { labels: 'ubuntu-latest' }, { labels: ['self-hosted', 'macOS'] }])('accepts literal supported routing %j', route => {
        expect(isCopilotCommentRunner(route)).toBe(true);
    });
    it.each([undefined, null, true, 42, '', ' leading', 'trailing ', '${{ matrix.os }}', 'x'.repeat(101), 'line\nbreak',
        [], [''], ['Linux', 'linux'], Array.from({ length: 11 }, (_, index) => `label-${index}`), ['good', 42], {},
        { group: undefined }, { unknown: 'route' }, { group: '' }, { group: 'trusted', labels: [] }, { labels: true }])('rejects invalid or ambiguous routing %j', route => {
        expect(isCopilotCommentRunner(route)).toBe(false);
    });
    it('rejects oversized JSON before parsing it', () => {
        expect(() => copilotCommentRunner({ uses: COPILOT_COMMENT_REMOTE_WORKFLOW, with: { 'runs-on': ' '.repeat(16_001) } })).toThrow('review');
    });
});
