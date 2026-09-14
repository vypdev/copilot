import type { PromptName } from '../index';
import {
    getPrompt,
    PROMPT_NAMES,
    getAnswerIssueHelpPrompt,
    getThinkPrompt,
} from '../index';

describe('getPrompt', () => {
    it('returns same result as getAnswerIssueHelpPrompt for ANSWER_ISSUE_HELP', () => {
        const params = {
            description: 'How to install?',
            projectContextInstruction: '**Use context.**',
            targetLocale: 'en-US',
        };
        const viaRegistry = getPrompt(PROMPT_NAMES.ANSWER_ISSUE_HELP, params);
        const viaGetter = getAnswerIssueHelpPrompt(params);
        expect(viaRegistry).toBe(viaGetter);
        expect(viaRegistry).toContain('How to install?');
    });

    it('returns same result as getThinkPrompt for THINK', () => {
        const params = {
            projectContextInstruction: 'X',
            contextBlock: '\n\n',
            question: 'q',
            targetLocale: 'en-US',
        };
        const viaRegistry = getPrompt(PROMPT_NAMES.THINK, params);
        const viaGetter = getThinkPrompt(params);
        expect(viaRegistry).toBe(viaGetter);
    });

    it.each([
        PROMPT_NAMES.UPDATE_PULL_REQUEST_DESCRIPTION,
        PROMPT_NAMES.USER_REQUEST,
        PROMPT_NAMES.RECOMMEND_STEPS,
        PROMPT_NAMES.CHECK_PROGRESS,
        PROMPT_NAMES.CHECK_COMMENT_LANGUAGE,
        PROMPT_NAMES.TRANSLATE_COMMENT,
        PROMPT_NAMES.CLI_DO,
        PROMPT_NAMES.BUGBOT,
        PROMPT_NAMES.BUGBOT_FIX,
        PROMPT_NAMES.BUGBOT_FIX_INTENT,
    ])('renders registered prompt %s', (name) => {
        expect(getPrompt(name, new Proxy({}, { get: () => 'fixture' }) as never)).toEqual(expect.any(String));
    });

    it('throws for unknown prompt name', () => {
        expect(() =>
            getPrompt('unknown' as PromptName, { description: 'x', projectContextInstruction: 'y', targetLocale: 'en-US' })
        ).toThrow('Unknown prompt');
    });
});

describe('PROMPT_NAMES', () => {
    it('includes all expected prompt keys', () => {
        expect(PROMPT_NAMES.ANSWER_ISSUE_HELP).toBe('answer_issue_help');
        expect(PROMPT_NAMES.THINK).toBe('think');
        expect(PROMPT_NAMES.UPDATE_PULL_REQUEST_DESCRIPTION).toBe('update_pull_request_description');
        expect(PROMPT_NAMES.USER_REQUEST).toBe('user_request');
        expect(PROMPT_NAMES.RECOMMEND_STEPS).toBe('recommend_steps');
        expect(PROMPT_NAMES.CHECK_PROGRESS).toBe('check_progress');
        expect(PROMPT_NAMES.CHECK_COMMENT_LANGUAGE).toBe('check_comment_language');
        expect(PROMPT_NAMES.TRANSLATE_COMMENT).toBe('translate_comment');
        expect(PROMPT_NAMES.CLI_DO).toBe('cli_do');
        expect(PROMPT_NAMES.BUGBOT).toBe('bugbot');
        expect(PROMPT_NAMES.BUGBOT_FIX).toBe('bugbot_fix');
        expect(PROMPT_NAMES.BUGBOT_FIX_INTENT).toBe('bugbot_fix_intent');
    });
});
