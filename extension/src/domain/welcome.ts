export const WELCOME_STAGES = Object.freeze(['welcome', 'profile', 'permissions', 'complete'] as const);
export type WelcomeStage = typeof WELCOME_STAGES[number];
export function welcomeNext(stage: WelcomeStage): WelcomeStage | null {
    const index = WELCOME_STAGES.indexOf(stage);
    return index === WELCOME_STAGES.length - 1 ? null : WELCOME_STAGES[index + 1];
}
