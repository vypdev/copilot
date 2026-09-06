import { parseBugbotReviewCommandOptions } from '../review_command';

describe('Bugbot review command options', () => {
    it('parses explicit per-run overrides without repository-specific assumptions', () => {
        expect(parseBugbotReviewCommandOptions(['effort=high', 'dry-run=true', 'verbose=true', 'suggestions=false'])).toEqual({
            valid: true,
            overrides: {
                effort: 'high',
                publicationMode: 'dry-run',
                traceRules: true,
                suggestedChanges: false,
            },
        });
    });

    it.each([['effort=maximum'], ['unknown=true'], ['dry-run=yes'], ['bare']])('rejects unsupported input %s', (...input) => {
        expect(parseBugbotReviewCommandOptions(input).valid).toBe(false);
    });
});
