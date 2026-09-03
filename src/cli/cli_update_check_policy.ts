const UPDATE_CHECK_DISABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const COMMANDS_WITHOUT_UPDATE_CHECK = new Set(['help', 'upgrade']);

export const UPDATE_CHECK_DISABLED_ENV = 'COPILOT_DISABLE_UPDATE_CHECK';

export function isUpdateCheckDisabled(environment: NodeJS.ProcessEnv = process.env): boolean {
    const value = environment[UPDATE_CHECK_DISABLED_ENV]?.trim().toLowerCase();
    return value !== undefined && UPDATE_CHECK_DISABLED_VALUES.has(value);
}

export function shouldCheckForUpdates(commandName: string): boolean {
    return !COMMANDS_WITHOUT_UPDATE_CHECK.has(commandName);
}
