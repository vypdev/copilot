import { Ai } from '../../../../../../data/model/ai';
import {
    projectBugbotContextSelectionContext,
    projectBugbotReviewOperationContext,
    type BugbotReviewOperationSource,
} from '../bugbot_review_operation_context';

function source(overrides: Partial<BugbotReviewOperationSource> = {}): BugbotReviewOperationSource {
    return {
        owner: 'acme',
        repo: 'copilot',
        issueNumber: 42,
        isPullRequest: true,
        eventName: 'pull_request',
        tokenUser: '  vypbot  ',
        pullRequest: { number: 9, head: ' feature/42 ', action: 'synchronize' },
        commit: { branch: 'refs/pull/9/merge' },
        currentConfiguration: { parentBranch: 'master' },
        branches: { development: 'develop' },
        locale: { pullRequest: 'es-ES' },
        inputs: {
            before: 'a'.repeat(40),
            after: 'b'.repeat(40),
            repository: { id: 7 },
            pull_request: {
                draft: true,
                head: {
                    sha: 'C'.repeat(40),
                    repo: { owner: { login: 'fork-owner' } },
                },
            },
        },
        ai: new Ai('', 'review-model', false, ['dist/*'], false, 'medium', 15, [], {
            findings: { provider: 'codex', model: 'findings-model' },
            fixer: { provider: 'codex', model: 'fixer-model' },
            reviewer: { provider: 'codex', model: 'review-model', effort: 'high' },
        }, undefined, {
            effort: 'smart',
            organizationRules: ['rule one'],
        }),
        ...overrides,
    };
}

describe('Bugbot review operation context', () => {
    it('projects exact immutable PR facts without credentials and keeps selection narrow', () => {
        const input = {
            ...source(),
            tokens: { token: 'secret-token' },
        } as BugbotReviewOperationSource;
        const context = projectBugbotReviewOperationContext(input);
        const selection = projectBugbotContextSelectionContext({
            ...input,
            ai: {
                getAiIgnoreFiles: input.ai.getAiIgnoreFiles.bind(input.ai),
                getBugbotReviewConfiguration: input.ai.getBugbotReviewConfiguration.bind(input.ai),
            },
        });

        expect(context).toEqual(expect.objectContaining({
            repository: { owner: 'acme', name: 'copilot', id: 7 },
            target: expect.objectContaining({
                issueNumber: 42,
                pullRequestNumber: 9,
                headBranch: 'feature/42',
                baseBranch: 'master',
                draft: true,
            }),
            trigger: expect.objectContaining({
                kind: 'pull_request',
                expectedHeadSha: 'c'.repeat(40),
                headOwner: 'fork-owner',
            }),
            trustedAuthorLogin: 'vypbot',
            ignorePatterns: ['dist/*'],
            organizationRules: ['rule one'],
            analysis: expect.objectContaining({
                agentConfiguration: { provider: 'codex', model: 'review-model', effort: 'high' },
                minimumSeverity: 'medium',
                commentLimit: 15,
            }),
        }));
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(context.organizationRules)).toBe(true);
        expect(context.analysis.reviewConfiguration).not.toHaveProperty('organizationRules');
        expect(JSON.stringify(context)).not.toContain('secret-token');
        expect(JSON.stringify(context)).not.toContain('tokens');
        expect(selection.ignorePatterns).toEqual(['dist/*']);
        expect(selection.organizationRules).toEqual(['rule one']);
        expect(selection).not.toHaveProperty('analysis');
        expect(selection).not.toHaveProperty('locale');
    });

    it('copies arrays so later aggregate mutations cannot change the review facts', () => {
        const mutableIgnorePatterns = ['dist/*'];
        const mutableOrganizationRules = ['rule one'];
        const input = source({
            ai: new Ai('', 'model', false, mutableIgnorePatterns, false, 'low', 20, [], undefined, undefined, {
                organizationRules: mutableOrganizationRules,
            }),
        });

        const context = projectBugbotReviewOperationContext(input);
        mutableIgnorePatterns.push('generated/*');
        mutableOrganizationRules.push('rule two');

        expect(context.ignorePatterns).toEqual(['dist/*']);
        expect(context.organizationRules).toEqual(['rule one']);
    });

    it('selects branch findings and normalizes invalid optional provider identities away', () => {
        const context = projectBugbotReviewOperationContext(source({
            issueNumber: -1,
            isPullRequest: false,
            eventName: 'push',
            tokenUser: ' ',
            pullRequest: { number: -1, head: '', action: '' },
            commit: { branch: ' feature/no-issue ' },
            currentConfiguration: {},
            inputs: { repository: { id: 0 }, pull_request: { head: { sha: 'not-a-sha' } } },
        }));

        expect(context.repository).toEqual({ owner: 'acme', name: 'copilot' });
        expect(context.target).toEqual(expect.objectContaining({
            isPullRequest: false,
            headBranch: 'feature/no-issue',
            baseBranch: 'develop',
        }));
        expect(context.analysis.agentConfiguration.model).toBe('findings-model');
        expect(context.trigger).not.toHaveProperty('expectedHeadSha');
        expect(context).not.toHaveProperty('trustedAuthorLogin');
    });

    it.each([
        ['workflow_run', { workflow_run: { head_sha: 'D'.repeat(40) } }],
        ['check_suite', { check_suite: { head_sha: 'E'.repeat(40) } }],
    ])('normalizes the expected head for %s review triggers', (eventName, inputs) => {
        const context = projectBugbotReviewOperationContext(source({ eventName, inputs }));

        expect(context.trigger.expectedHeadSha).toBe(
            eventName === 'workflow_run' ? 'd'.repeat(40) : 'e'.repeat(40),
        );
    });

    it('fails closed to an empty head when an incomplete PR source reaches the boundary', () => {
        const incomplete = { ...source(), pullRequest: undefined } as unknown as BugbotReviewOperationSource;

        const context = projectBugbotReviewOperationContext(incomplete);

        expect(context.target.headBranch).toBe('');
        expect(context.target.pullRequestNumber).toBe(-1);
        expect(context.target.pullRequestAction).toBe('');
    });

});
