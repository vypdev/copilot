import * as core from '@actions/core';
import { resolveJsonInput } from './action_input_source';
import { logError } from '../utils/logger';
import { toApplicationError } from '../application/errors/application_error';

export function getGithubActionInput(key: string, options?: { required?: boolean }): string {
    let value: string | undefined;
    try {
        const inputVarsJson = process.env.INPUT_VARS_JSON;
        value = resolveJsonInput(inputVarsJson, key);
    } catch (error) {
        logError(toApplicationError(error, 'configuration.invalid', 'Unable to parse INPUT_VARS_JSON.'));
    }

    value = (value ?? core.getInput(key, options)).trim();
    if (options?.required && value.length === 0) throw new Error(`Input required and not supplied: ${key}`);
    if (key.toLowerCase() === 'token' && value) core.setSecret(value);
    return value;
}
