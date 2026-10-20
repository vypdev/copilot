import { UpdateTitleUseCase } from '../update_title_use_case';
import type { UpdateTitleContext } from '../update_title_workflow';
import { titleLabelFacts } from '../../../../../../test-support/title-label-facts';

jest.mock('../../../../../utils/logger', () => ({ logInfo: jest.fn() }));

const authorTitle = 'chore: run backend OWASP audits only on manual dispatch';
const context = (eventTitle: string): UpdateTitleContext => ({ kind: 'pull-request', enabled: true,
    issueNumber: 192, pullRequestNumber: 194, pullRequestTitle: eventTitle, labelFacts: titleLabelFacts({ isChore: true }) });

function fixture(currentTitle: string | undefined) {
    const port = { getTitle: jest.fn(async number => number === 194 ? currentTitle : '🔧 - Move backend OWASP audits'),
        updateIssueTitle: jest.fn(), updatePullRequestTitle: jest.fn().mockResolvedValue('chore: generated (#192)') };
    return { port, useCase: new UpdateTitleUseCase(port) };
}

describe('live PR title precedence', () => {
    test('preserves an author conventional title despite a decorated linked issue', async () => {
        const { port, useCase } = fixture(authorTitle);
        expect(await useCase.invoke(context(authorTitle))).toEqual([expect.objectContaining({ success: true, executed: false })]);
        expect(port.getTitle).toHaveBeenCalledTimes(1);
        expect(port.getTitle).toHaveBeenCalledWith(194);
        expect(port.updatePullRequestTitle).not.toHaveBeenCalled();
    });
    test('does not undo a contributor correction when the event still contains a decorated title', async () => {
        const { port, useCase } = fixture(authorTitle);
        await useCase.invoke(context('[#192] 🔧 - Old generated title'));
        expect(port.updatePullRequestTitle).not.toHaveBeenCalled();
        expect(port.getTitle).not.toHaveBeenCalledWith(192);
    });
    test('replayed processing leaves a conventional title untouched', async () => {
        const { port, useCase } = fixture(authorTitle);
        for (let attempt = 0; attempt < 2; attempt++) await useCase.invoke(context('outdated event'));
        expect(port.getTitle).toHaveBeenCalledTimes(2);
        expect(port.updatePullRequestTitle).not.toHaveBeenCalled();
    });
    test('blocks mutation when the live PR title cannot be read', async () => {
        const { port, useCase } = fixture(undefined);
        expect((await useCase.invoke(context(authorTitle)))[0]).toMatchObject({ success: false });
        expect(port.getTitle).toHaveBeenCalledTimes(1);
        expect(port.updatePullRequestTitle).not.toHaveBeenCalled();
    });
    test('uses current metadata instead of an obsolete conventional event title', async () => {
        const { port, useCase } = fixture('Current plain title');
        await useCase.invoke(context(authorTitle));
        expect(port.updatePullRequestTitle).toHaveBeenCalledWith(expect.objectContaining({ pullRequestTitle: 'Current plain title' }));
    });
    test('blocks mutation when the linked issue cannot be read after the live PR read', async () => {
        const { port, useCase } = fixture('Current plain title');
        port.getTitle.mockImplementation(async number => number === 194 ? 'Current plain title' : undefined);
        expect((await useCase.invoke(context('stale title')))[0]).toMatchObject({ success: false });
        expect(port.updatePullRequestTitle).not.toHaveBeenCalled();
    });
});
