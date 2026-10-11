/** Structured schema rejection with no provider content or parsed-response authority. */
export class AgentResponseLengthFailure extends Error {
    constructor(readonly path: string, readonly maximum: number) {
        super(`Agent response schema violation at ${path}: string is too long.`);
        this.name = 'AgentResponseLengthFailure';
    }
}
