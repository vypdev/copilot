import { buildGithubActionEventInputs } from '../github_event_inputs';

describe('buildGithubActionEventInputs', () => {
    it('preserves the webhook payload and adds the runtime context expected by Execution', () => {
        const payload = {
            action: 'opened',
            issue: { number: 334 },
            repository: { name: 'payload-repository' },
        };

        expect(buildGithubActionEventInputs({
            payload,
            eventName: 'issues',
            actor: 'octocat',
            repo: { owner: 'vypdev', repo: 'copilot' },
        })).toEqual({
            ...payload,
            eventName: 'issues',
            actor: 'octocat',
            repo: { owner: 'vypdev', repo: 'copilot' },
        });
    });

    it('uses the runtime context as the authoritative repository identity', () => {
        expect(buildGithubActionEventInputs({
            payload: {
                actor: 'payload-actor',
                repo: { owner: 'payload-owner', repo: 'payload-repo' },
            },
            eventName: 'issues',
            actor: 'runtime-actor',
            repo: { owner: 'runtime-owner', repo: 'runtime-repo' },
    })).toMatchObject({
            actor: 'runtime-actor',
            repo: { owner: 'runtime-owner', repo: 'runtime-repo' },
        });
    });

    it('rejects a runtime context without repository coordinates', () => {
        expect(() => buildGithubActionEventInputs({
            payload: {},
            eventName: 'issues',
            actor: 'actor',
            repo: { owner: '', repo: '' },
        })).toThrow('Repository context requires a non-empty owner and repository.');
    });

    it.each([
        ['eventName', { eventName: '' }],
        ['actor', { actor: '  ' }],
    ])('rejects a runtime context without a non-empty %s', (_label, override) => {
        expect(() => buildGithubActionEventInputs({
            payload: {},
            eventName: 'issues',
            actor: 'octocat',
            repo: { owner: 'vypdev', repo: 'copilot' },
            ...override,
        })).toThrow(/GitHub event context requires a non-empty/);
    });

    it('normalizes surrounding whitespace in trusted runtime context', () => {
        expect(buildGithubActionEventInputs({
            payload: {},
            eventName: ' issues ',
            actor: ' octocat ',
            repo: { owner: ' vypdev ', repo: ' copilot ' },
        })).toMatchObject({
            eventName: 'issues',
            actor: 'octocat',
            repo: { owner: 'vypdev', repo: 'copilot' },
        });
    });
});
