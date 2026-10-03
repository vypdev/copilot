import type { AgentExecutionExitDiagnostic } from '../../application/ports/agent_execution_observation_ports';

/** Provider stderr is untrusted and may contain credentials. Return a fixed code only. */
export function classifyAgentCliExitDiagnostic(stderr: string): AgentExecutionExitDiagnostic {
    if (/\b(?:authentication (?:failed|required)|unauthorized|unauthenticated|invalid api key|not logged in|login required|http 401)\b/iu.test(stderr)) {
        return 'reported-authentication';
    }
    if (/\b(?:unknown model|unsupported model|model[^\r\n]{0,100}(?:not found|not available|unsupported|does not exist|invalid))\b/iu.test(stderr)) {
        return 'reported-model-unavailable';
    }
    if (/\b(?:unexpected argument|unknown option|unrecognized option|unsupported option|invalid option)\b/iu.test(stderr)) {
        return 'reported-unsupported-option';
    }
    if (/\b(?:unknown (?:config(?:uration)? )?(?:field|key)|unrecognized config(?:uration)?|unsupported config(?:uration)?|error parsing configuration)\b/iu.test(stderr)) {
        return 'reported-unsupported-configuration';
    }
    if (/\b(?:connection (?:refused|failed|reset)|network error|timed out|rate limit|too many requests|http 429|503 service unavailable)\b/iu.test(stderr)) {
        return 'reported-transport-or-rate-limit';
    }
    return 'unclassified';
}
