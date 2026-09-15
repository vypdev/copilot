import {
    buildCopilotHelpMessage,
    buildCopilotWelcomeMessage,
    buildCopilotWelcomeResult,
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

    it('renders the supported command reference and welcome copy in Spanish', () => {
        expect(buildCopilotHelpMessage('vypbot', 'es-MX')).toContain('## Comandos de Copilot');
        expect(buildCopilotHelpMessage('vypbot', 'es-MX')).toContain('/copilot implement <request>');
        expect(buildCopilotHelpMessage('vypbot', 'es-MX')).toContain('/copilot explain <path or symbol>');
        expect(buildCopilotWelcomeMessage('vypbot', 'es-ES')).toContain('Hola, soy **@vypbot**');
    });

    it('renders welcome copy without embedding publication identity', () => {
        const welcome = buildCopilotWelcomeMessage('vypbot');
        expect(welcome).not.toContain('<!-- copilot:');
        expect(welcome).toContain('Hi! I’m **@vypbot**');
        expect(welcome).toContain('/copilot help');
    });

    it('builds a publishable markdown welcome result', () => {
        expect(buildCopilotWelcomeResult('vypbot')).toMatchObject({
            id: 'CopilotWelcomeUseCase',
            stepFormat: 'markdown',
            executed: true,
        });
        expect(buildCopilotWelcomeResult('vypbot', 'es-ES').steps[0]).toContain('Hola, soy **@vypbot**');
    });
});
