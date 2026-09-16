import {
    color,
    displayWidth,
    doctorIcon,
    formatTask,
    renderBox,
    renderRemoteConfiguration,
    statusIcon,
} from '../setup_prompt_rendering';
import { stdout } from 'node:process';

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
        ['skipped', '–'],
    ] as const)('maps doctor status %s to %s', (status, expected) => {
        expect(doctorIcon(status)).toBe(expected);
    });

    it('formats task labels and leaves non-TTY text uncolored', () => {
        expect(formatTask('planner')).toBe('Planner');
        expect(formatTask('')).toBe('');
        expect(color('text', 36)).toBe('text');
    });

    it('colors TTY output while visible width ignores ANSI, combining marks, and controls', () => {
        const descriptor = Object.getOwnPropertyDescriptor(stdout, 'isTTY');
        const previousNoColor = process.env.NO_COLOR;
        Object.defineProperty(stdout, 'isTTY', { configurable: true, value: true });
        delete process.env.NO_COLOR;

        try {
            expect(color('text', 36)).toBe('\u001b[36mtext\u001b[0m');
            expect(displayWidth('\u001b[36me\u0301🙂\u0007\u001b[0m')).toBe(3);
        } finally {
            if (descriptor) Object.defineProperty(stdout, 'isTTY', descriptor);
            else Reflect.deleteProperty(stdout, 'isTTY');
            if (previousNoColor === undefined) delete process.env.NO_COLOR;
            else process.env.NO_COLOR = previousNoColor;
        }
    });

    it('renders a bordered box with a title and content', () => {
        const rendered = renderBox('first\nsecond', 'Setup', 32);

        expect(rendered).toContain('Setup');
        expect(rendered).toContain('first');
        expect(rendered).toContain('second');
        expect(rendered.split('\n')[0]).toMatch(/^╭─+╮$/);
    });

    it('wraps readable output to a requested narrow terminal width', () => {
        const rendered = renderBox(
            'A long setup diagnostic sentence that must remain readable in a narrow terminal.',
            'Setup',
            32,
            40,
        );

        expect(rendered.split('\n').every((line) => line.length <= 40)).toBe(true);
        expect(rendered).toContain('diagnostic sentence');
    });

    it('wraps unspaced CJK and spaced right-to-left copy by visible terminal width', () => {
        const cjk = renderBox('診断結果を安全に表示して次の操作を明確に案内します', '診断', 32, 32);
        const rtl = renderBox('حالة التشخيص الحالية تتطلب إجراء واضحا وآمنا', 'التشخيص', 32, 32);

        expect(cjk.split('\n').every((line) => displayWidth(line) <= 32)).toBe(true);
        expect(rtl.split('\n').every((line) => displayWidth(line) <= 32)).toBe(true);
        expect(cjk.split('\n').length).toBeGreaterThan(3);
        expect(rtl.split('\n').length).toBeGreaterThan(3);
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
