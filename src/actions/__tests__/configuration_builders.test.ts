import { buildEmoji, buildImages, buildIssue, buildIssueTypes, buildLabels, buildLocale, buildProjects, buildPullRequest, buildTokens, buildWorkflows } from '../configuration_builders';

describe('configuration builders', () => {
    it('builds locale and workflows', () => {
        expect(buildLocale('es', 'fr')).toMatchObject({ issue: 'es', pullRequest: 'fr' });
        expect(buildWorkflows('release.yml', 'hotfix.yml')).toMatchObject({ release: 'release.yml', hotfix: 'hotfix.yml' });
    });

    it('builds project configuration with named columns', () => {
        const projects = buildProjects({
            projects: [],
            issueCreated: 'created',
            pullRequestCreated: 'pr-created',
            issueInProgress: 'progress',
            pullRequestInProgress: 'pr-progress',
        });

        expect(projects.getProjects()).toEqual([]);
        expect(projects.getProjectColumnIssueCreated()).toBe('created');
        expect(projects.getProjectColumnPullRequestCreated()).toBe('pr-created');
        expect(projects.getProjectColumnIssueInProgress()).toBe('progress');
        expect(projects.getProjectColumnPullRequestInProgress()).toBe('pr-progress');
    });

    it('preserves issue and pull request input context', () => {
        const inputs = { action: 'opened', issue: { title: 'Issue from CLI' } };
        const issue = buildIssue(true, false, 2, inputs);
        const pullRequest = buildPullRequest(1, 2, 30, inputs);

        expect(issue.inputs).toBe(inputs);
        expect(issue.branchManagementAlways).toBe(true);
        expect(pullRequest.inputs).toBe(inputs);
        expect(pullRequest.mergeTimeout).toBe(30);
    });

    it('builds emoji and token configuration', () => {
        expect(buildEmoji(true, 'branch')).toMatchObject({ emojiLabeledTitle: true, branchManagementEmoji: 'branch' });
        expect(buildTokens('token')).toMatchObject({ token: 'token' });
    });

    it('maps image configuration by scope without positional ambiguity', () => {
        const scope = (prefix: string) => ({
            automatic: [`${prefix}-automatic`],
            feature: [`${prefix}-feature`],
            bugfix: [`${prefix}-bugfix`],
            release: [`${prefix}-release`],
            hotfix: [`${prefix}-hotfix`],
            docs: [`${prefix}-docs`],
            chore: [`${prefix}-chore`],
        });
        const images = buildImages({ onIssue: true, onPullRequest: false, onCommit: true, issue: scope('issue'), pullRequest: scope('pr'), commit: scope('commit') });

        expect(images.imagesOnIssue).toBe(true);
        expect(images.imagesOnPullRequest).toBe(false);
        expect(images.issueFeatureGifs).toEqual(['issue-feature']);
        expect(images.pullRequestAutomaticActions).toEqual(['pr-automatic']);
        expect(images.commitChoreGifs).toEqual(['commit-chore']);
    });

    it('maps labels by branching, workflow, priority, and size groups', () => {
        const labels = buildLabels({
            branching: { launcher: 'branched' },
            workflow: { bug: 'bug', bugfix: 'bugfix', hotfix: 'hotfix', enhancement: 'enhancement', feature: 'feature', release: 'release', question: 'question', help: 'help', deploy: 'deploy', deployed: 'deployed', docs: 'docs', documentation: 'documentation', chore: 'chore', maintenance: 'maintenance' },
            priorities: { high: 'P0', medium: 'P1', low: 'P2', none: 'none' },
            sizes: { xxl: 'XXL', xl: 'XL', l: 'L', m: 'M', s: 'S', xs: 'XS' },
        });

        expect(labels.branchManagementLauncherLabel).toBe('branched');
        expect(labels.isBug).toBe(false);
        expect(labels.sizeLabels).toEqual(['XXL', 'XL', 'L', 'M', 'S', 'XS']);
        expect(labels.priorityHigh).toBe('P0');
    });

    it('maps issue types from named definitions', () => {
        const definition = (name: string) => ({ name, description: `${name} description`, color: `${name}-color` });
        const issueTypes = buildIssueTypes({ task: definition('task'), bug: definition('bug'), feature: definition('feature'), documentation: definition('documentation'), maintenance: definition('maintenance'), hotfix: definition('hotfix'), release: definition('release'), question: definition('question'), help: definition('help') });

        expect(issueTypes.task).toBe('task');
        expect(issueTypes.taskDescription).toBe('task description');
        expect(issueTypes.releaseColor).toBe('release-color');
        expect(issueTypes.help).toBe('help');
    });
});
