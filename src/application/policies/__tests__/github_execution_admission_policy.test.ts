import {
    resolveGithubExecutionAdmission,
    type GithubExecutionAdmissionInput,
} from '../github_execution_admission_policy';

function admission(overrides: Partial<GithubExecutionAdmissionInput> = {}): GithubExecutionAdmissionInput {
    return {
        actor: 'developer',
        tokenUser: 'copilot-bot',
        isSingleAction: false,
        validSingleAction: false,
        ...overrides,
    };
}

describe('resolveGithubExecutionAdmission', () => {
    it('executes when the event actor differs from the PAT user', () => {
        expect(resolveGithubExecutionAdmission(admission())).toBe('execute');
    });

    it('discards a normal run when the event actor owns the PAT', () => {
        expect(resolveGithubExecutionAdmission(admission({
            actor: 'Copilot-Bot',
            tokenUser: 'copilot-bot',
        }))).toBe('discard');
    });

    it('executes a valid single action even when the actor owns the PAT', () => {
        expect(resolveGithubExecutionAdmission(admission({
            actor: 'copilot-bot',
            tokenUser: 'COPILOT-BOT',
            isSingleAction: true,
            validSingleAction: true,
        }))).toBe('execute');
    });

    it('discards an invalid single action when the actor owns the PAT', () => {
        expect(resolveGithubExecutionAdmission(admission({
            actor: 'copilot-bot',
            tokenUser: 'copilot-bot',
            isSingleAction: true,
            validSingleAction: false,
        }))).toBe('discard');
    });

    it('does not match empty identities', () => {
        expect(resolveGithubExecutionAdmission(admission({ actor: '', tokenUser: '' }))).toBe('execute');
    });
});
