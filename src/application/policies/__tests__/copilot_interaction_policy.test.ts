import {
    buildCopilotHelpMessage,
    buildCopilotWelcomeMessage,
    buildCopilotWelcomeResult,
    COPILOT_WELCOME_MARKER,
    normalizeCopilotBotUsername,
} from '../copilot_interaction_policy';

describe('Copilot interaction policy', () => {
    it('normalizes safe GitHub bot usernames and falls back safely', () => {
        expect(normalizeCopilotBotUsername('@VYPBOT')).toBe('VYPBOT');
        expect(normalizeCopilotBotUsername('not a username')).toBe('vypbot');
        expect(normalizeCopilotBotUsername(undefined)).toBe('vypbot');
    });

    it('renders the supported command reference', () => {
        const help = buildCopilotHelpMessage('vypbot');
        expect(help).toContain('/copilot help');
        expect(help).toContain('/copilot analyze');
        expect(help).toContain('/copilot implement <request>');
        expect(help).toContain('@vypbot');
    });

    it('renders a marked one-time issue welcome message', () => {
        const welcome = buildCopilotWelcomeMessage('vypbot');
        expect(welcome.startsWith(COPILOT_WELCOME_MARKER)).toBe(true);
        expect(welcome).toContain('Hi! I’m **@vypbot**');
        expect(welcome).toContain('/copilot help');
    });

    it('builds a publishable markdown welcome result', () => {
        expect(buildCopilotWelcomeResult('vypbot')).toMatchObject({
            id: 'CopilotWelcomeUseCase',
            stepFormat: 'markdown',
            executed: true,
        });
    });
});
