export interface FixerAgentResponse {
    text: string;
    sessionId: string;
}
export declare function interpretFixerResponse(parts: unknown, sessionId: string): FixerAgentResponse;
