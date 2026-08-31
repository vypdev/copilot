import * as core from '@actions/core';
import { GithubActionSummaryAdapter } from '../github_action_summary_adapter';

jest.mock('@actions/core', () => {
    const write = jest.fn();
    const addRaw = jest.fn(() => ({ write }));
    return { summary: { addRaw, write } };
});

const summary = core.summary as unknown as {
    addRaw: jest.Mock;
    write: jest.Mock;
};

describe('GithubActionSummaryAdapter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        summary.write.mockResolvedValue(undefined);
    });

    it('publishes the generated summary through the GitHub Actions summary API', async () => {
        await new GithubActionSummaryAdapter().publish('# Copilot execution');

        expect(summary.addRaw).toHaveBeenCalledWith('# Copilot execution');
        expect(summary.write).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the GitHub summary API is unavailable', async () => {
        await new GithubActionSummaryAdapter(null).publish('# Copilot execution');

        expect(summary.addRaw).not.toHaveBeenCalled();
    });
});
