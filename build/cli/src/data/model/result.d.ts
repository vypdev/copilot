export type ResultStepFormat = 'plain' | 'markdown';
export declare class Result {
    id: string;
    success: boolean;
    executed: boolean;
    steps: string[];
    payload: any;
    reminders: string[];
    errors: Error[];
    stepFormat: ResultStepFormat;
    constructor(data: any);
}
