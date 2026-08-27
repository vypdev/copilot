import * as core from '@actions/core';
import { resolveJsonInput } from './action_input_source';
import { logError } from '../utils/logger';

export function getGithubActionInput(key: string, options?: { required?: boolean }): string {
    try {
        const inputVarsJson = process.env.INPUT_VARS_JSON;
        const value = resolveJsonInput(inputVarsJson, key);
        if (value !== undefined) {
            return value;
        }
    } catch (error) {
        logError(`Error parsing INPUT_VARS_JSON: ${JSON.stringify(error, null, 2)}`);
    }

    return core.getInput(key, options);
}
