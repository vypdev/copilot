import { sessionCredential, sessionStep, type SessionMutationTrace, type SessionOperationTrace } from './session_observation_ports.ts';

/** Follow only this operation's actual native epoch callbacks; an external advance permanently retires it. */
export class CredentialEpochFence {
    private expected: number;
    constructor(private readonly epoch: () => number) { this.expected = epoch(); }
    current(): boolean { return this.epoch() === this.expected; }
    follow(observer: SessionOperationTrace | null): SessionMutationTrace {
        return {
            step: effect => sessionStep(observer, effect),
            credential: (previous, next) => {
                if (previous === this.expected && next === previous + 1) this.expected = next;
                sessionCredential(observer, previous, next);
            },
        };
    }
}
