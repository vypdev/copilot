export type AgentResponseSchemaReason = 'type' | 'enum' | 'string-short' | 'number-finite' | 'number-min' | 'number-max'
    | 'array-short' | 'array-long' | 'required' | 'additional';

/** Internal schema facts; public boundaries must select their own closed detail. */
export class AgentResponseSchemaFailure extends Error {
    constructor(readonly reason: AgentResponseSchemaReason, readonly path: string, message: string) {
        super(message);
    }
}
