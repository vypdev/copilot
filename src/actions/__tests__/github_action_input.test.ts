import * as core from '@actions/core';
import { logError } from '../../utils/logger';
import { getGithubActionInput } from '../github_action_input';

jest.mock('@actions/core', () => ({ getInput: jest.fn(), setSecret: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logError: jest.fn() }));

describe('GitHub Action PAT input boundary', () => {
    const previous = process.env.INPUT_VARS_JSON;
    beforeEach(() => { jest.clearAllMocks(); delete process.env.INPUT_VARS_JSON; });
    afterAll(() => {
        if (previous === undefined) delete process.env.INPUT_VARS_JSON;
        else process.env.INPUT_VARS_JSON = previous;
    });

    it.each(['environment', 'json'])('masks the trimmed PAT before returning it from %s', source => {
        if (source === 'json') process.env.INPUT_VARS_JSON = JSON.stringify({ INPUT_TOKEN: '  fixture-pat  ' });
        else (core.getInput as jest.Mock).mockReturnValue('  fixture-pat  ');
        expect(getGithubActionInput('token', { required: true })).toBe('fixture-pat');
        expect(core.setSecret).toHaveBeenCalledWith('fixture-pat');
        expect(core.getInput).toHaveBeenCalledTimes(source === 'json' ? 0 : 1);
    });

    it('rejects a required empty JSON PAT instead of falling back to a different identity', () => {
        process.env.INPUT_VARS_JSON = JSON.stringify({ INPUT_TOKEN: '  ' });
        expect(() => getGithubActionInput('token', { required: true })).toThrow('Input required');
        expect(core.getInput).not.toHaveBeenCalled();
        expect(core.setSecret).not.toHaveBeenCalled();
    });

    it('uses the normal input when the JSON source omits the PAT', () => {
        process.env.INPUT_VARS_JSON = '{}';
        (core.getInput as jest.Mock).mockReturnValue('fallback-pat');
        expect(getGithubActionInput('token', { required: true })).toBe('fallback-pat');
        expect(core.getInput).toHaveBeenCalledWith('token', { required: true });
    });

    it('does not leak malformed JSON diagnostics before masking the fallback PAT', () => {
        process.env.INPUT_VARS_JSON = '{"INPUT_TOKEN":"private-fixture';
        (core.getInput as jest.Mock).mockReturnValue('fallback-pat');
        expect(getGithubActionInput('token')).toBe('fallback-pat');
        expect(logError).toHaveBeenCalledTimes(1);
        expect((logError as jest.Mock).mock.calls[0][0].toJSON()).not.toHaveProperty('cause');
        expect((logError as jest.Mock).mock.calls[0][0].message).not.toContain('private-fixture');
    });

    it('does not register non-secret configuration or optional empty values as secrets', () => {
        (core.getInput as jest.Mock).mockReturnValueOnce('develop').mockReturnValueOnce('');
        expect(getGithubActionInput('development-branch')).toBe('develop');
        expect(getGithubActionInput('token')).toBe('');
        expect(core.setSecret).not.toHaveBeenCalled();
    });
});
