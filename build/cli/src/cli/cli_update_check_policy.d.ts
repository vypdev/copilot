export declare const UPDATE_CHECK_DISABLED_ENV = "COPILOT_DISABLE_UPDATE_CHECK";
export declare function isUpdateCheckDisabled(environment?: NodeJS.ProcessEnv): boolean;
export declare function shouldCheckForUpdates(commandName: string): boolean;
