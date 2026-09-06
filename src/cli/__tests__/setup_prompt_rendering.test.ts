import {
    color,
    doctorIcon,
    formatTask,
    renderBox,
    renderRemoteConfiguration,
    statusIcon,
} from '../setup_prompt_rendering';

describe('setup prompt rendering', () => {
    it.each([
        ['valid', '✓'],
        ['unverifiable', '?'],
        ['missing', '!'],
        ['not_required', '–'],
        ['invalid', '✗'],
    ] as const)('maps credential status %s to %s', (status, expected) => {
        expect(statusIcon(status)).toBe(expected);
    });

    it.each([
        ['pass', '✓'],
        ['warn', '⚠'],
        ['fail', '✗'],
    ] as const)('maps doctor status %s to %s', (status, expected) => {
        expect(doctorIcon(status)).toBe(expected);
    });

    it('formats task labels and leaves non-TTY text uncolored', () => {
        expect(formatTask('planner')).toBe('Planner');
        expect(formatTask('')).toBe('');
        expect(color('text', 36)).toBe('text');
    });

    it('renders a bordered box with a title and content', () => {
        const rendered = renderBox('first\nsecond', 'Setup', 32);

        expect(rendered).toContain('Setup');
        expect(rendered).toContain('first');
        expect(rendered).toContain('second');
        expect(rendered.split('\n')[0]).toMatch(/^╭─+╮$/);
    });

    it('renders remote metadata without exposing credential values', () => {
        const rendered = renderRemoteConfiguration(
            {
                ownerType: 'Organization',
                repositoryId: 42,
                repositoryVisibility: 'private',
                repositorySecrets: ['PAT'],
                organizationSecrets: ['OPENAI_API_KEY'],
                repositoryVariables: [{ name: 'AGENT_MODEL', value: 'gpt-5.6' }],
                organizationVariables: [{ name: 'AGENT_PROVIDER', value: 'codex' }],
                organizationAccess: 'available',
                organizationSecretsAccess: 'available',
                organizationVariablesAccess: 'available',
            },
            [{ name: 'AGENT_MODEL', value: 'gpt-5.6' }],
            [{ name: 'PAT', kind: 'workflowPat', description: 'workflow token' }],
        );

        expect(rendered).toContain('Organization resources can be inspected');
        expect(rendered).toContain('PAT');
        expect(rendered).not.toContain('credential-value');
    });

    it('renders empty remote collections and unavailable organization access', () => {
        const rendered = renderRemoteConfiguration(
            {
                ownerType: 'User',
                repositoryVisibility: 'unknown',
                repositorySecrets: [],
                organizationSecrets: [],
                repositoryVariables: [],
                organizationVariables: [],
                organizationAccess: 'unavailable',
                organizationSecretsAccess: 'unavailable',
                organizationVariablesAccess: 'unavailable',
            },
            [],
            [],
        );

        expect(rendered).toContain('repository ID: unknown');
        expect(rendered).toContain('(none detected)');
        expect(rendered).toContain('Organization resource inspection: unavailable.');
    });
});
