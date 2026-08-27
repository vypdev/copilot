type LocalActionResult = {
    executed: boolean;
    steps: string[];
    errors: Error[];
    reminders: string[];
};
export declare function renderLocalActionResults(results: LocalActionResult[]): void;
export {};
