import * as core from '@actions/core';
import { resolveJsonInput } from './action_input_source';
import { logError } from '../utils/logger';
import { toApplicationError } from '../application/errors/application_error';

export function getGithubActionInput(key: string, options?: { required?: boolean }): string {
    try {
        const inputVarsJson = process.env.INPUT_VARS_JSON;
        const value = resolveJsonInput(inputVarsJson, key);
        if (value !== undefined) {
            return value;
        }
    } catch (error) {
        logError(toApplicationError(error, 'configuration.invalid', 'Unable to parse INPUT_VARS_JSON.'));
    }

    return core.getInput(key, options);
}
