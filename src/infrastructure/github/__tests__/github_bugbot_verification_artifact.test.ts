import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createGithubBugbotVerificationArtifacts } from '../github_bugbot_verification_artifact';

const receipt = '<!-- copilot-bugbot-verification:v1 {"version":1} -->';
const verification = { runId: 19, attempt: 2, receipt };
const previous = { run: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT };

beforeEach(() => {
    process.env.GITHUB_RUN_ID = '19';
    process.env.GITHUB_RUN_ATTEMPT = '2';
});

afterAll(() => {
    if (previous.run === undefined) delete process.env.GITHUB_RUN_ID;
    else process.env.GITHUB_RUN_ID = previous.run;
    if (previous.attempt === undefined) delete process.env.GITHUB_RUN_ATTEMPT;
    else process.env.GITHUB_RUN_ATTEMPT = previous.attempt;
});

it.each([false, true])('publishes a bound data artifact and cleans its owned staging directory, failure=%s', async fails => {
    let staging = '';
    const upload = jest.fn(async (name: string, file: string) => {
        staging = dirname(file);
        expect(name).toBe('copilot-bugbot-verification-v1-19-2');
        expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 1, checkRunId: 71, ...verification });
        if (fails) throw new Error('controlled unavailable upload');
        return { id: 37 };
    });
    const pending = createGithubBugbotVerificationArtifacts(upload).publish(71, verification);
    if (fails) await expect(pending).rejects.toThrow('controlled unavailable upload');
    else await expect(pending).resolves.toBeUndefined();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(existsSync(staging)).toBe(false);
});

it.each([{ runId: 20 }, { attempt: 1 }, { receipt: 'unbound text' }])('rejects a different native binding before upload (%j)', async change => {
    const upload = jest.fn();
    await expect(createGithubBugbotVerificationArtifacts(upload).publish(71, { ...verification, ...change }))
        .rejects.toThrow('bugbot-verification-artifact-binding');
    expect(upload).not.toHaveBeenCalled();
});
